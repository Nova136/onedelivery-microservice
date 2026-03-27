# WebSocket connection state (ws.connections) and rate limit counters (ws.rate_limit)
# are stored in the existing RDS PostgreSQL instance — no separate DynamoDB tables needed.
# Schema and tables are created by scripts/init-schemas.sql (local) and must be run once
# against the RDS instance after first Terraform apply (same as the other service schemas).
