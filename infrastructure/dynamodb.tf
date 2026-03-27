# ──────────────────────────────────────────────────────────────────────────────
# DynamoDB tables for the WebSocket chat layer (created when enable_websocket = true)
# ──────────────────────────────────────────────────────────────────────────────

# Stores connectionId → {userId, sessionId} for the duration of the WebSocket connection.
# TTL automatically expires records after 24 hours as a safety net.
resource "aws_dynamodb_table" "ws_connections" {
  count        = var.enable_websocket ? 1 : 0
  name         = "${local.name}-ws-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = { Name = "${local.name}-ws-connections" }
}

# Tracks per-user request counts in 1-minute tumbling windows for rate limiting.
# Schema: PK=userId, SK=window (Unix minute string).
# TTL expires old windows after 2 minutes so the table stays small.
resource "aws_dynamodb_table" "ws_rate_limit" {
  count        = var.enable_websocket ? 1 : 0
  name         = "${local.name}-ws-rate-limit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "window"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "window"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = { Name = "${local.name}-ws-rate-limit" }
}
