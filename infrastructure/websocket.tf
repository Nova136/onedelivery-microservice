# ──────────────────────────────────────────────────────────────────────────────
# WebSocket API Gateway for async chat
#
# Created when enable_websocket = true.
#
# Routes:
#   $connect     – Lambda Authorizer (JWT + RBAC + rate limit) → connect Lambda
#   $disconnect  – disconnect Lambda
#   sendMessage  – send-message Lambda → RabbitMQ → orchestrator-agent → WS push back
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "websocket" {
  count                      = var.enable_websocket ? 1 : 0
  name                       = "${local.name}-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

# ── Lambda Authorizer ──────────────────────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "ws" {
  count           = var.enable_websocket ? 1 : 0
  api_id          = aws_apigatewayv2_api.websocket[0].id
  authorizer_type = "REQUEST"
  authorizer_uri  = aws_lambda_function.ws_authorizer[0].invoke_arn
  # Token arrives as ?token=<JWT> on the WebSocket upgrade request
  identity_sources = ["route.request.querystring.token"]
  name             = "${local.name}-ws-authorizer"
}

# ── Lambda integrations ────────────────────────────────────────────────────────

resource "aws_apigatewayv2_integration" "ws_connect" {
  count                     = var.enable_websocket ? 1 : 0
  api_id                    = aws_apigatewayv2_api.websocket[0].id
  integration_type          = "AWS_PROXY"
  integration_uri           = aws_lambda_function.ws_connect[0].invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
}

resource "aws_apigatewayv2_integration" "ws_disconnect" {
  count                     = var.enable_websocket ? 1 : 0
  api_id                    = aws_apigatewayv2_api.websocket[0].id
  integration_type          = "AWS_PROXY"
  integration_uri           = aws_lambda_function.ws_disconnect[0].invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
}

resource "aws_apigatewayv2_integration" "ws_send_message" {
  count                     = var.enable_websocket ? 1 : 0
  api_id                    = aws_apigatewayv2_api.websocket[0].id
  integration_type          = "AWS_PROXY"
  integration_uri           = aws_lambda_function.ws_send_message[0].invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
}

# ── Routes ─────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_route" "ws_connect" {
  count              = var.enable_websocket ? 1 : 0
  api_id             = aws_apigatewayv2_api.websocket[0].id
  route_key          = "$connect"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.ws[0].id
  target             = "integrations/${aws_apigatewayv2_integration.ws_connect[0].id}"
}

resource "aws_apigatewayv2_route" "ws_disconnect" {
  count     = var.enable_websocket ? 1 : 0
  api_id    = aws_apigatewayv2_api.websocket[0].id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_disconnect[0].id}"
}

resource "aws_apigatewayv2_route" "ws_send_message" {
  count     = var.enable_websocket ? 1 : 0
  api_id    = aws_apigatewayv2_api.websocket[0].id
  route_key = "sendMessage"
  target    = "integrations/${aws_apigatewayv2_integration.ws_send_message[0].id}"
}

# ── CloudWatch log group for WebSocket API access logs ─────────────────────────

resource "aws_cloudwatch_log_group" "apigw_ws" {
  count             = var.enable_websocket ? 1 : 0
  name              = "/aws/apigateway/${local.name}-ws"
  retention_in_days = 7
}

# ── Stage ──────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_stage" "ws" {
  count       = var.enable_websocket ? 1 : 0
  api_id      = aws_apigatewayv2_api.websocket[0].id
  name        = "prod"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_ws[0].arn
    format = jsonencode({
      requestId          = "$context.requestId"
      requestTime        = "$context.requestTime"
      connectionId       = "$context.connectionId"
      eventType          = "$context.eventType"
      routeKey           = "$context.routeKey"
      status             = "$context.status"
      integrationStatus  = "$context.integrationStatus"
      integrationError   = "$context.integrationErrorMessage"
      authorizerError    = "$context.authorizer.error"
      errorMessage       = "$context.error.message"
      errorResponseType  = "$context.error.responseType"
      sourceIp           = "$context.identity.sourceIp"
      userAgent          = "$context.identity.userAgent"
    })
  }

  depends_on = [aws_api_gateway_account.main]
}
