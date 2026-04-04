# ──────────────────────────────────────────────────────────────────────────────
# SSM Parameter Store — SecureString secrets for AI agent services
#
# All parameters are stored as SecureString (AWS-managed KMS key).
# ECS retrieves them at container start via the task execution role — values
# never appear in CloudWatch logs or the ECS console environment tab.
#
# To update a value without a full terraform apply:
#   aws ssm put-parameter --name "/onedelivery/OPENAI_API_KEY" \
#     --value "sk-..." --type SecureString --overwrite
# Then force-redeploy the affected ECS services.
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "openai_api_key" {
  name        = "/${local.name}/OPENAI_API_KEY"
  description = "OpenAI API key used by all AI agent services"
  type        = "SecureString"
  value       = var.openai_api_key

  lifecycle {
    ignore_changes = [value] # Allow out-of-band rotation without Terraform drift
  }
}

resource "aws_ssm_parameter" "langsmith_tracing" {
  name        = "/${local.name}/LANGSMITH_TRACING"
  description = "Enable LangSmith tracing (true/false)"
  type        = "SecureString"
  value       = "true"
}

resource "aws_ssm_parameter" "langsmith_endpoint" {
  name        = "/${local.name}/LANGSMITH_ENDPOINT"
  description = "LangSmith / LangChain API endpoint"
  type        = "SecureString"
  value       = "https://api.smith.langchain.com"
}

resource "aws_ssm_parameter" "langsmith_api_key" {
  name        = "/${local.name}/LANGSMITH_API_KEY"
  description = "LangSmith API key (also used as LANGCHAIN_API_KEY)"
  type        = "SecureString"
  value       = var.langsmith_api_key

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "langsmith_project" {
  name        = "/${local.name}/LANGSMITH_PROJECT"
  description = "LangSmith project name for tracing grouping"
  type        = "SecureString"
  value       = "OneDelivery"
}

resource "aws_ssm_parameter" "eval_langsmith_api_key" {
  name        = "/${local.name}/EVAL_LANGSMITH_API_KEY"
  description = "LangSmith API key used by eval / CI scripts"
  type        = "SecureString"
  value       = var.eval_langsmith_api_key

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "gemini_api_key" {
  name        = "/${local.name}/GEMINI_API_KEY"
  description = "Google Gemini API key"
  type        = "SecureString"
  value       = var.gemini_api_key

  lifecycle {
    ignore_changes = [value]
  }
}

# ── Infrastructure secrets ─────────────────────────────────────────────────────

resource "aws_ssm_parameter" "database_url" {
  name        = "/${local.name}/DATABASE_URL"
  description = "Full PostgreSQL connection string (includes credentials)"
  type        = "SecureString"
  # No sslmode in the URL — pg v8 treats sslmode=require as verify-full, which
  # overrides ssl.rejectUnauthorized=false in both TypeORM and direct pg clients.
  # SSL is controlled by the application's ssl option (rejectUnauthorized: false).
  value       = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"
}

resource "aws_ssm_parameter" "db_password" {
  name        = "/${local.name}/DB_PASSWORD"
  description = "RDS master password"
  type        = "SecureString"
  value       = var.db_password

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name        = "/${local.name}/JWT_SECRET"
  description = "JWT signing secret shared across all services"
  type        = "SecureString"
  value       = "REDACTED_JWT_SECRET"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "rabbitmq_url" {
  name        = "/${local.name}/RABBITMQ_URL"
  description = "LavinMQ (CloudAMQP) AMQPS connection URL"
  type        = "SecureString"
  value       = "amqps://prigraqy:RotEGUGQXBnhaPT6FvVoJ19Cp3rGdTm8@capybara.lmq.cloudamqp.com:5671/prigraqy"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "cors_origin" {
  name        = "/${local.name}/CORS_ORIGIN"
  description = "Comma-separated list of allowed CORS origins"
  type        = "SecureString"
  value       = join(",", distinct(concat(["http://localhost:5173"], var.cors_allowed_origins)))
}

# ── Convenience local: list of all secret ARNs (used in IAM policy) ───────────
locals {
  ssm_secret_arns = [
    # AI / LLM
    aws_ssm_parameter.openai_api_key.arn,
    aws_ssm_parameter.langsmith_tracing.arn,
    aws_ssm_parameter.langsmith_endpoint.arn,
    aws_ssm_parameter.langsmith_api_key.arn,
    aws_ssm_parameter.langsmith_project.arn,
    aws_ssm_parameter.eval_langsmith_api_key.arn,
    aws_ssm_parameter.gemini_api_key.arn,
    # Infrastructure
    aws_ssm_parameter.database_url.arn,
    aws_ssm_parameter.db_password.arn,
    aws_ssm_parameter.jwt_secret.arn,
    aws_ssm_parameter.rabbitmq_url.arn,
    aws_ssm_parameter.cors_origin.arn,
  ]

  # Secrets block injected into every container definition
  container_secrets = [
    # AI / LLM
    { name = "OPENAI_API_KEY",         valueFrom = aws_ssm_parameter.openai_api_key.arn },
    { name = "LANGSMITH_TRACING",      valueFrom = aws_ssm_parameter.langsmith_tracing.arn },
    { name = "LANGSMITH_ENDPOINT",     valueFrom = aws_ssm_parameter.langsmith_endpoint.arn },
    { name = "LANGSMITH_API_KEY",      valueFrom = aws_ssm_parameter.langsmith_api_key.arn },
    { name = "LANGCHAIN_API_KEY",      valueFrom = aws_ssm_parameter.langsmith_api_key.arn },
    { name = "LANGSMITH_PROJECT",      valueFrom = aws_ssm_parameter.langsmith_project.arn },
    { name = "EVAL_LANGSMITH_API_KEY", valueFrom = aws_ssm_parameter.eval_langsmith_api_key.arn },
    { name = "GEMINI_API_KEY",         valueFrom = aws_ssm_parameter.gemini_api_key.arn },
    # Infrastructure
    { name = "DATABASE_URL",           valueFrom = aws_ssm_parameter.database_url.arn },
    { name = "DB_PASSWORD",            valueFrom = aws_ssm_parameter.db_password.arn },
    { name = "JWT_SECRET",             valueFrom = aws_ssm_parameter.jwt_secret.arn },
    { name = "RABBITMQ_URL",           valueFrom = aws_ssm_parameter.rabbitmq_url.arn },
    { name = "CORS_ORIGIN",            valueFrom = aws_ssm_parameter.cors_origin.arn },
  ]
}
