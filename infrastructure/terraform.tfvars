# ──────────────────────────────────────────────────────────────────────────────
# terraform.tfvars.example
#
# Copy this file to terraform.tfvars and fill in the values below.
# Lines marked REQUIRED have no default and must be set before terraform apply.
# ──────────────────────────────────────────────────────────────────────────────

# ── AWS account & region ──────────────────────────────────────────────────────

aws_region     = "ap-southeast-1" # AWS region to deploy into
aws_account_id = "542829982577"   # REQUIRED – your 12-digit AWS account ID
environment    = "dev"            # dev | staging | prod

# ── Networking ────────────────────────────────────────────────────────────────

# REQUIRED – ID of an existing VPC. Terraform will create new subnets inside it.
# Retrieve with: aws ec2 describe-vpcs --query 'Vpcs[*].VpcId'
vpc_id   = "vpc-01f4d46470a373bd0"
vpc_cidr = "10.0.0.0/16" # Must match the actual CIDR of the VPC above

# ── RDS PostgreSQL ────────────────────────────────────────────────────────────

db_name     = "onedelivery"
db_username = "postgres"     # REQUIRED – RDS master username
db_password = "64M4YXh08pe7" # REQUIRED – min 8 chars, no @/"

postgres_instance_class          = "db.t3.micro" # db.t3.micro is free-tier eligible
postgres_engine_version          = "17.6"
postgres_allocated_storage       = 20 # GB; 20 is the free-tier maximum
postgres_max_allocated_storage   = 20 # Set higher to enable storage autoscaling
postgres_backup_retention_period = 7  # Days; 0 disables automated backups

# ── ECS Fargate ───────────────────────────────────────────────────────────────

ecs_desired_count = 1  # Set to 1+ to start tasks; 0 avoids Fargate cost
ecs_cpu           = 256 # CPU units per task (256 = 0.25 vCPU)
ecs_memory_mb     = 512 # Memory per task in MB

# ECR repository names — override only if your repositories are named differently.
# ecr_repository_names = {
#   order              = "onedelivery-order"
#   logistics          = "onedelivery-logistics"
#   payment            = "onedelivery-payment"
#   audit              = "onedelivery-audit"
#   user               = "onedelivery-user"
#   incident           = "onedelivery-incident"
#   knowledge          = "onedelivery-knowledge"
#   orchestrator-agent = "onedelivery-orchestrator-agent"
#   guardian-agent     = "onedelivery-guardian-agent"
#   logistics-agent    = "onedelivery-logistics-agent"
#   resolution-agent   = "onedelivery-resolution-agent"
#   qa-agent           = "onedelivery-qa-agent"
# }

# ── Feature flags ─────────────────────────────────────────────────────────────

# enable_alb = true creates the ALB, path-based listener rules for all 11 HTTP
# services, and an HTTP API Gateway as the public entry point. Adds ~$32/month.
# Set to false during development to avoid cost; ECS tasks still run but have
# no external HTTP entry point.
enable_alb = true

# enable_websocket = true creates the WebSocket API Gateway, Lambda Authorizer
# (JWT + RBAC + per-user rate limiting via PostgreSQL), and the four WebSocket
# Lambda functions (authorizer, connect, disconnect, send-message). Requires
# enable_alb = true. Connection state and rate-limit counters are stored in the
# existing RDS instance (ws schema) — no additional database is needed.
# Note: the send-message Lambda reaches CloudAMQP over the internet; a NAT
# gateway is required in the VPC if no other internet-egress path exists.
enable_websocket = true

# Maximum WebSocket messages a single user may send per minute.
# Enforced at connect time (rejects with close code 4001) and per message.
# Only relevant when enable_websocket = true.
ws_rate_limit_per_minute = 20


cors_allowed_origins=["https://nova136.github.io/onedelivery-frontend"]     
    