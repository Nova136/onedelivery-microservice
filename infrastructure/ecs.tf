# ECS cluster, task execution role, task role, and security group (RDS reference in rds.tf)
resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name}-ecs-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

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
  services = toset(["order", "logistics", "payment", "audit", "user", "incident", "orchestrator-agent", "guardian-agent", "logistic-agent", "resolution-agent", "qa-agent"])
  # Container port 80 so ALB path-based routing works when apps expose HTTP
  service_ports = {
    order             = 80
    logistics         = 80
    payment           = 80
    audit             = 80
    user              = 80
    incident          = 80
    orchestrator-agent = 80
    guardian-agent     = 80
    logistic-agent     = 80
    resolution-agent   = 80
    qa-agent          = 80
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
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "DATABASE_URL", value = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}" },
      { name = "JWT_SECRET", value = "REDACTED_JWT_SECRET" },
      { name = "RABBITMQ_URL", value = "amqps://grdulrnl:REDACTED_CLOUDAMQP_PASSWORD@armadillo.rmq.cloudamqp.com:5671/grdulrnl" },
      { name = "CORS_ORIGIN", value = "*" },
      { name = "DB_HOST", value = "postgres" },
      { name = "DB_PORT", value = "5432" },
      { name = "DB_NAME", value = "onedelivery" },
      { name = "DB_USER", value = "postgres" },
      { name = "DB_PASSWORD", value = "postgres" },


    ]
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
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  dynamic "load_balancer" {
    for_each = var.enable_alb ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.service[each.key].arn
      container_name   = each.key
      container_port   = local.service_ports[each.key]
    }
  }
}
