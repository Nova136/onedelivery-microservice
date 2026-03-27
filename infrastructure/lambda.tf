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

resource "aws_iam_role_policy_attachment" "lambda_ws_logs" {
  count      = var.enable_websocket ? 1 : 0
  role       = aws_iam_role.lambda_ws[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_ws_dynamodb" {
  count = var.enable_websocket ? 1 : 0
  name  = "${local.name}-lambda-ws-dynamodb"
  role  = aws_iam_role.lambda_ws[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:UpdateItem",
        ]
        Resource = [
          aws_dynamodb_table.ws_connections[0].arn,
          aws_dynamodb_table.ws_rate_limit[0].arn,
        ]
      }
    ]
  })
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
# Lambda zip packages
# ──────────────────────────────────────────────────────────────────────────────

# authorizer, connect, disconnect – single-file (no external deps; AWS SDK v3 is built-in)
data "archive_file" "authorizer" {
  count       = var.enable_websocket ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/lambda/authorizer/index.js"
  output_path = "${path.module}/lambda/authorizer.zip"
}

data "archive_file" "connect" {
  count       = var.enable_websocket ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/lambda/connect/index.js"
  output_path = "${path.module}/lambda/connect.zip"
}

data "archive_file" "disconnect" {
  count       = var.enable_websocket ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/lambda/disconnect/index.js"
  output_path = "${path.module}/lambda/disconnect.zip"
}

# send-message – requires amqplib; npm install runs before the zip is created
resource "null_resource" "send_message_install" {
  count = var.enable_websocket ? 1 : 0

  triggers = {
    package_json = filemd5("${path.module}/lambda/send-message/package.json")
    index_js     = filemd5("${path.module}/lambda/send-message/index.js")
  }

  provisioner "local-exec" {
    command     = "npm install --production --no-fund --no-audit"
    working_dir = "${path.module}/lambda/send-message"
  }
}

data "archive_file" "send_message" {
  count       = var.enable_websocket ? 1 : 0
  type        = "zip"
  source_dir  = "${path.module}/lambda/send-message"
  output_path = "${path.module}/lambda/send-message.zip"
  depends_on  = [null_resource.send_message_install]
}

# ──────────────────────────────────────────────────────────────────────────────
# Lambda functions
# ──────────────────────────────────────────────────────────────────────────────

locals {
  lambda_runtime = "nodejs20.x"
  lambda_env = var.enable_websocket ? {
    CONNECTIONS_TABLE      = aws_dynamodb_table.ws_connections[0].name
    RATE_LIMIT_TABLE       = aws_dynamodb_table.ws_rate_limit[0].name
    RATE_LIMIT_PER_MINUTE  = tostring(var.ws_rate_limit_per_minute)
    JWT_SECRET             = "ffa32c3d40342bec6c1bcfba7b4f8197"
    ALLOWED_ROLES          = "customer,admin"
    RABBITMQ_URL           = "amqps://grdulrnl:FLkurItpuAPeOM-VfalX5iGxQkRxuYVi@armadillo.rmq.cloudamqp.com:5671/grdulrnl"
    ORCHESTRATOR_QUEUE     = "orchestrator_agent_queue"
    AWS_REGION_NAME        = var.aws_region
  } : {}
}

resource "aws_lambda_function" "ws_authorizer" {
  count         = var.enable_websocket ? 1 : 0
  function_name = "${local.name}-ws-authorizer"
  role          = aws_iam_role.lambda_ws[0].arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 10

  filename         = data.archive_file.authorizer[0].output_path
  source_code_hash = data.archive_file.authorizer[0].output_base64sha256

  environment {
    variables = local.lambda_env
  }
}

resource "aws_lambda_function" "ws_connect" {
  count         = var.enable_websocket ? 1 : 0
  function_name = "${local.name}-ws-connect"
  role          = aws_iam_role.lambda_ws[0].arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 10

  filename         = data.archive_file.connect[0].output_path
  source_code_hash = data.archive_file.connect[0].output_base64sha256

  environment {
    variables = local.lambda_env
  }
}

resource "aws_lambda_function" "ws_disconnect" {
  count         = var.enable_websocket ? 1 : 0
  function_name = "${local.name}-ws-disconnect"
  role          = aws_iam_role.lambda_ws[0].arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 10

  filename         = data.archive_file.disconnect[0].output_path
  source_code_hash = data.archive_file.disconnect[0].output_base64sha256

  environment {
    variables = local.lambda_env
  }
}

resource "aws_lambda_function" "ws_send_message" {
  count         = var.enable_websocket ? 1 : 0
  function_name = "${local.name}-ws-send-message"
  role          = aws_iam_role.lambda_ws[0].arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 15

  filename         = data.archive_file.send_message[0].output_path
  source_code_hash = data.archive_file.send_message[0].output_base64sha256

  environment {
    variables = local.lambda_env
  }
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
