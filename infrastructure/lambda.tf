# ──────────────────────────────────────────────────────────────────────────────
# IAM role shared by all four WebSocket Lambda functions
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda_ws" {
  count = var.enable_websocket ? 1 : 0
  name  = "${local.name}-lambda-ws"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Basic execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_ws_logs" {
  count      = var.enable_websocket ? 1 : 0
  role       = aws_iam_role.lambda_ws[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC access — required to reach RDS in the private subnets
resource "aws_iam_role_policy_attachment" "lambda_ws_vpc" {
  count      = var.enable_websocket ? 1 : 0
  role       = aws_iam_role.lambda_ws[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Allow the ECS task role to push messages back to WebSocket clients
resource "aws_iam_role_policy" "ecs_task_ws_callback" {
  count = var.enable_websocket ? 1 : 0
  name  = "${local.name}-ecs-task-ws-callback"
  role  = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "execute-api:ManageConnections"
      Resource = "arn:aws:execute-api:${var.aws_region}:${local.account_id}:${aws_apigatewayv2_api.websocket[0].id}/prod/POST/@connections/*"
    }]
  })
}

# ──────────────────────────────────────────────────────────────────────────────
# Lambda zip packages (npm install runs before zipping)
# ──────────────────────────────────────────────────────────────────────────────

locals {
  lambda_dirs = ["authorizer", "connect", "disconnect", "send-message"]
}

resource "null_resource" "lambda_install" {
  for_each = var.enable_websocket ? toset(local.lambda_dirs) : toset([])

  triggers = {
    package_json = filemd5("${path.module}/lambda/${each.key}/package.json")
    index_js     = filemd5("${path.module}/lambda/${each.key}/index.js")
  }

  provisioner "local-exec" {
    command     = "npm install --production --no-fund --no-audit"
    working_dir = "${path.module}/lambda/${each.key}"
  }
}

data "archive_file" "lambda" {
  for_each    = var.enable_websocket ? toset(local.lambda_dirs) : toset([])
  type        = "zip"
  source_dir  = "${path.module}/lambda/${each.key}"
  output_path = "${path.module}/lambda/${each.key}.zip"
  depends_on  = [null_resource.lambda_install]
}

# ──────────────────────────────────────────────────────────────────────────────
# Shared Lambda environment (PostgreSQL + RabbitMQ)
# ──────────────────────────────────────────────────────────────────────────────

locals {
  lambda_runtime = "nodejs20.x"
  lambda_env = var.enable_websocket ? {
    DATABASE_URL           = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"
    RATE_LIMIT_PER_MINUTE  = tostring(var.ws_rate_limit_per_minute)
    JWT_SECRET             = "ffa32c3d40342bec6c1bcfba7b4f8197"
    ALLOWED_ROLES          = "User,Admin"
    RABBITMQ_URL           = "amqps://grdulrnl:FLkurItpuAPeOM-VfalX5iGxQkRxuYVi@armadillo.rmq.cloudamqp.com:5671/grdulrnl"
    ORCHESTRATOR_QUEUE     = "orchestrator_agent_queue"
  } : {}

  # Lambdas run in the same VPC subnets as ECS so they can reach RDS (private subnets)
  lambda_vpc_config = var.enable_websocket ? {
    subnet_ids         = [aws_subnet.public_a.id, aws_subnet.public_b.id, aws_subnet.public_c.id]
    security_group_ids = [aws_security_group.ecs_tasks.id]
  } : null
}

# ──────────────────────────────────────────────────────────────────────────────
# Lambda functions
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_lambda_function" "ws_authorizer" {
  count         = var.enable_websocket ? 1 : 0
  function_name = "${local.name}-ws-authorizer"
  role          = aws_iam_role.lambda_ws[0].arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 10

  filename         = data.archive_file.lambda["authorizer"].output_path
  source_code_hash = data.archive_file.lambda["authorizer"].output_base64sha256

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  environment { variables = local.lambda_env }
}

resource "aws_lambda_function" "ws_connect" {
  count         = var.enable_websocket ? 1 : 0
  function_name = "${local.name}-ws-connect"
  role          = aws_iam_role.lambda_ws[0].arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 10

  filename         = data.archive_file.lambda["connect"].output_path
  source_code_hash = data.archive_file.lambda["connect"].output_base64sha256

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  environment { variables = local.lambda_env }
}

resource "aws_lambda_function" "ws_disconnect" {
  count         = var.enable_websocket ? 1 : 0
  function_name = "${local.name}-ws-disconnect"
  role          = aws_iam_role.lambda_ws[0].arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 10

  filename         = data.archive_file.lambda["disconnect"].output_path
  source_code_hash = data.archive_file.lambda["disconnect"].output_base64sha256

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  environment { variables = local.lambda_env }
}

resource "aws_lambda_function" "ws_send_message" {
  count         = var.enable_websocket ? 1 : 0
  function_name = "${local.name}-ws-send-message"
  role          = aws_iam_role.lambda_ws[0].arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 15

  filename         = data.archive_file.lambda["send-message"].output_path
  source_code_hash = data.archive_file.lambda["send-message"].output_base64sha256

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  environment { variables = local.lambda_env }
}

# ──────────────────────────────────────────────────────────────────────────────
# Allow API Gateway to invoke each Lambda
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_lambda_permission" "ws_authorizer" {
  count         = var.enable_websocket ? 1 : 0
  statement_id  = "AllowWebSocketAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_authorizer[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket[0].execution_arn}/*"
}

resource "aws_lambda_permission" "ws_connect" {
  count         = var.enable_websocket ? 1 : 0
  statement_id  = "AllowWebSocketConnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_connect[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket[0].execution_arn}/*"
}

resource "aws_lambda_permission" "ws_disconnect" {
  count         = var.enable_websocket ? 1 : 0
  statement_id  = "AllowWebSocketDisconnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_disconnect[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket[0].execution_arn}/*"
}

resource "aws_lambda_permission" "ws_send_message" {
  count         = var.enable_websocket ? 1 : 0
  statement_id  = "AllowWebSocketSendMessage"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_send_message[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket[0].execution_arn}/*"
}
