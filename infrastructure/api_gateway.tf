# API Gateway HTTP API - integrates directly with the internet-facing ALB
# (No VPC Link needed: the ALB is already public-facing, so API Gateway can
#  reach it over the internet. VPC Links with public subnets cause
#  INTEGRATION_NETWORK_FAILURE because ENIs in public subnets have no public IP.)
resource "aws_apigatewayv2_api" "main" {
  count         = var.enable_alb ? 1 : 0
  name          = "${local.name}-api"
  protocol_type = "HTTP"
  description   = "OneDelivery API Gateway -> ALB"

  # cors_configuration is handled at API Gateway level so OPTIONS preflights are
  # answered before they reach the ALB (which may have unhealthy targets → 404/503).
  # allow_credentials = true is required because the frontend sends cookies/JWT.
  # AWS behaviour: when cors_configuration is set, API GW strips backend CORS headers
  # and substitutes its own — so the origins here must match the frontend exactly.
  cors_configuration {
    allow_credentials = true
    allow_origins     = distinct(concat(["http://localhost:5173"], var.cors_allowed_origins))
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization", "token", "owner"]
    max_age           = 300
  }
}

# Integration: forward all traffic directly to the ALB public DNS (no VPC Link).
# request_parameters overwrite:path is required — without it API GW forwards to
# the root "/" of the integration URI instead of the original request path.
resource "aws_apigatewayv2_integration" "alb" {
  count                  = var.enable_alb ? 1 : 0
  api_id                 = aws_apigatewayv2_api.main[0].id
  integration_type       = "HTTP_PROXY"
  integration_uri        = "http://${aws_lb.main[0].dns_name}"
  integration_method     = "ANY"
  payload_format_version = "1.0"

  request_parameters = {
    "overwrite:path" = "$request.path"
  }
}

# Explicit methods only — OPTIONS is intentionally excluded so API Gateway's
# cors_configuration handles preflight requests without forwarding them to the ALB.
# (ANY /{proxy+} would match OPTIONS and bypass cors_configuration entirely.)
locals {
  http_methods = var.enable_alb ? toset(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]) : toset([])
}

resource "aws_apigatewayv2_route" "proxy" {
  for_each  = local.http_methods
  api_id    = aws_apigatewayv2_api.main[0].id
  route_key = "${each.key} /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
}

resource "aws_apigatewayv2_route" "root" {
  for_each  = local.http_methods
  api_id    = aws_apigatewayv2_api.main[0].id
  route_key = "${each.key} /"
  target    = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
}

# CloudWatch log group for API Gateway access logs
resource "aws_cloudwatch_log_group" "apigw" {
  count             = var.enable_alb ? 1 : 0
  name              = "/aws/apigateway/${local.name}-api"
  retention_in_days = 7
}

# IAM role allowing API Gateway to push logs to CloudWatch.
# This is an account-level setting shared by all API Gateways (HTTP + WebSocket).
# Created whenever either API Gateway feature flag is enabled.
resource "aws_iam_role" "apigw_cloudwatch" {
  count = (var.enable_alb || var.enable_websocket) ? 1 : 0
  name  = "${local.name}-apigw-cw-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apigw_cloudwatch" {
  count      = (var.enable_alb || var.enable_websocket) ? 1 : 0
  role       = aws_iam_role.apigw_cloudwatch[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# Wire the IAM role into the account-level API Gateway settings
resource "aws_api_gateway_account" "main" {
  count               = (var.enable_alb || var.enable_websocket) ? 1 : 0
  cloudwatch_role_arn = aws_iam_role.apigw_cloudwatch[0].arn
  depends_on          = [aws_iam_role_policy_attachment.apigw_cloudwatch]
}

resource "aws_apigatewayv2_stage" "default" {
  count       = var.enable_alb ? 1 : 0
  api_id      = aws_apigatewayv2_api.main[0].id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw[0].arn
    format = jsonencode({
      requestId      = "$context.requestId"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      path           = "$context.path"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      integrationStatus  = "$context.integration.status"
      integrationError   = "$context.integration.error"
      integrationLatency = "$context.integration.latency"
      errorMessage       = "$context.error.message"
      errorResponseType  = "$context.error.responseType"
      sourceIp           = "$context.identity.sourceIp"
      userAgent          = "$context.identity.userAgent"
    })
  }

  depends_on = [aws_api_gateway_account.main]
}
