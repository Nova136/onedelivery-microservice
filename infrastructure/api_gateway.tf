# VPC Link so API Gateway can reach the ALB in the VPC (only when ALB is enabled)
resource "aws_apigatewayv2_vpc_link" "alb" {
  count               = var.enable_alb ? 1 : 0
  name                = "${local.name}-vpc-link"
  security_group_ids  = [aws_security_group.alb[0].id]
  subnet_ids = [
    aws_subnet.public_a.id,
    aws_subnet.public_b.id,
    aws_subnet.public_c.id,
  ]
}

# API Gateway HTTP API - integrates with ALB via VPC Link
resource "aws_apigatewayv2_api" "main" {
  count          = var.enable_alb ? 1 : 0
  name           = "${local.name}-api"
  protocol_type  = "HTTP"
  description    = "OneDelivery API Gateway -> ALB"
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
  }
}

# Integration: route all traffic to the ALB (via VPC Link)
resource "aws_apigatewayv2_integration" "alb" {
  count                  = var.enable_alb ? 1 : 0
  api_id                 = aws_apigatewayv2_api.main[0].id
  integration_type       = "HTTP_PROXY"
  integration_uri        = aws_lb_listener.http[0].arn
  integration_method     = "ANY"
  payload_format_version = "1.0"
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.alb[0].id
}

resource "aws_apigatewayv2_route" "proxy" {
  count    = var.enable_alb ? 1 : 0
  api_id   = aws_apigatewayv2_api.main[0].id
  route_key = "ANY /{proxy+}"
  target   = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
}

resource "aws_apigatewayv2_route" "root" {
  count    = var.enable_alb ? 1 : 0
  api_id   = aws_apigatewayv2_api.main[0].id
  route_key = "ANY /"
  target   = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
}

resource "aws_apigatewayv2_stage" "default" {
  count       = var.enable_alb ? 1 : 0
  api_id      = aws_apigatewayv2_api.main[0].id
  name        = "$default"
  auto_deploy = true
}
