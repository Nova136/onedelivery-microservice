# ECS cluster, task execution role, task role, and security group (RDS reference in rds.tf)
resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name}-ecs-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow the task execution role to pull SecureString values from SSM Parameter Store
# at container start time (before the app process begins).
# ssm:GetParameters is required for the secrets[] block in the task definition.
# kms:Decrypt is required because SecureString params are encrypted with a KMS key.
resource "aws_iam_role_policy" "ecs_task_execution_ssm" {
  name = "${local.name}-ecs-exec-ssm-secrets"
  role = aws_iam_role.ecs_task_execution.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SSMGetSecrets"
        Effect   = "Allow"
        Action   = ["ssm:GetParameters", "ssm:GetParameter"]
        Resource = local.ssm_secret_arns
      },
      {
        Sid      = "KMSDecryptSecureString"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        # Scoped to the AWS-managed SSM key for this region/account.
        # Replace with a specific CMK ARN if you use a customer-managed key.
        Resource = "arn:aws:kms:${var.aws_region}:${var.aws_account_id}:alias/aws/ssm"
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# Required for ECS Exec (aws ecs execute-command) and SSM port forwarding
resource "aws_iam_role_policy" "ecs_task_exec_ssm" {
  name = "${local.name}-ecs-exec"
  role = aws_iam_role.ecs_task.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ]
      Resource = "*"
    }]
  })
}

# execute-api:ManageConnections is granted in lambda.tf when enable_websocket = true

resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${local.name}-ecs-"
  vpc_id      = data.aws_vpc.main.id
  dynamic "ingress" {
    for_each = var.enable_alb ? [1] : []
    content {
      from_port       = 0
      to_port         = 65535
      protocol        = "tcp"
      security_groups = [aws_security_group.alb[0].id]
      description     = "ALB"
    }
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Task definition and service per microservice
locals {
  services = toset(["order", "logistics", "payment", "audit", "user", "incident", "knowledge", "orchestrator-agent", "guardian-agent", "logistics-agent", "resolution-agent", "qa-agent"])

  # resolution-agent is RabbitMQ-only (no HTTP server, no /health endpoint).
  # Only HTTP services get ALB target groups and load_balancer blocks.
  http_services = toset(["order", "logistics", "payment", "audit", "user", "incident", "knowledge", "orchestrator-agent", "guardian-agent", "logistics-agent", "qa-agent"])

  # Actual container ports each service listens on (set via ENV var in the container).
  service_ports = {
    order              = 9003
    logistics          = 9002
    payment            = 9004
    audit              = 9001
    user               = 9005
    incident           = 9006
    knowledge          = 9007
    orchestrator-agent = 9010
    guardian-agent     = 9013
    logistics-agent    = 9011
    resolution-agent   = 9012 # RMQ-only, no HTTP — port listed for portMappings completeness
    qa-agent           = 9014
  }

  # The NestJS env var each service reads to determine its HTTP listen port.
  # Must match the env var name in each app's main.ts configService.get() call.
  service_port_envvars = {
    order              = "ORDER_PORT"
    logistics          = "LOGISTICS_PORT"
    payment            = "PAYMENT_PORT"
    audit              = "AUDIT_PORT"
    user               = "USER_PORT"
    incident           = "INCIDENT_PORT"
    knowledge          = "KNOWLEDGE_PORT"
    orchestrator-agent = "ORCHESTRATOR_AGENT_PORT"
    guardian-agent     = "GUARDIAN_AGENT_PORT"
    logistics-agent    = "LOGISTICS_AGENT_PORT"
    resolution-agent   = "RESOLUTION_AGENT_PORT"
    qa-agent           = "QA_AGENT_PORT"
  }
}

data "aws_ecr_repository" "services" {
  for_each = local.services
  name     = var.ecr_repository_names[each.key]
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.services
  family                   = "${local.name}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory_mb
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = each.key
    image = "${data.aws_ecr_repository.services[each.key].repository_url}:latest"
    portMappings = [{
      containerPort = local.service_ports[each.key]
      hostPort      = local.service_ports[each.key]
      protocol      = "tcp"
    }]
    environment = concat(
      [
        { name = "NODE_ENV", value = "production" },
        # Non-secret DB connection details (credentials are in SSM secrets block below)
        { name = "DB_HOST", value = aws_db_instance.postgres.address },
        { name = "DB_PORT", value = tostring(aws_db_instance.postgres.port) },
        { name = "DB_NAME", value = var.db_name },
        { name = "DB_USER", value = var.db_username },
        # Inject the service-specific port env var so each NestJS app listens on the right port
        { name = local.service_port_envvars[each.key], value = tostring(local.service_ports[each.key]) },
      ],
      # WebSocket Management API endpoint – injected only into orchestrator-agent
      each.key == "orchestrator-agent" && var.enable_websocket ? [
        { name = "WEBSOCKET_API_ENDPOINT", value = "https://${aws_apigatewayv2_api.websocket[0].id}.execute-api.${var.aws_region}.amazonaws.com/prod" },
        { name = "AWS_REGION", value = var.aws_region },
      ] : []
    )
    # Secrets pulled from SSM Parameter Store by the execution role at container start.
    # Values are injected as env vars inside the container but never logged or
    # visible in the ECS console "Environment" tab.
    secrets = local.container_secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs[each.key].name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = each.key
      }
    }
  }])
}

resource "aws_cloudwatch_log_group" "ecs" {
  for_each          = local.services
  name              = "/ecs/${local.name}-${each.key}"
  retention_in_days = 14

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecs_service" "service" {
  for_each        = local.services
  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count           = var.ecs_desired_count
  launch_type             = "FARGATE"
  enable_execute_command  = true

  network_configuration {
    subnets = [
      aws_subnet.public_a.id,
      aws_subnet.public_b.id,
      aws_subnet.public_c.id,
    ]
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  # Only attach HTTP-capable services to the ALB; resolution-agent is RMQ-only.
  dynamic "load_balancer" {
    for_each = var.enable_alb && contains(tolist(local.http_services), each.key) ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.service[each.key].arn
      container_name   = each.key
      container_port   = local.service_ports[each.key]
    }
  }

  depends_on = [aws_lb_listener.http]
}
