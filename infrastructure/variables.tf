variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "aws_account_id" {
  description = "AWS account ID (e.g. for ECR image URIs)"
  type        = string
  default     = "542829982577"
}

variable "environment" {
  description = "Environment name (e.g. dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "onedelivery"
}

variable "db_username" {
  description = "Master username for PostgreSQL (stored in SSM or set via TF_VAR)"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Master password for PostgreSQL (set via TF_VAR_db_password)"
  type        = string
  sensitive   = true
}

variable "ecr_repository_names" {
  description = "ECR repository names for each microservice"
  type        = map(string)
  default = {
    order              = "onedelivery-order"
    logistics          = "onedelivery-logistics"
    payment            = "onedelivery-payment"
    audit              = "onedelivery-audit"
    user               = "onedelivery-user"
    incident           = "onedelivery-incident"
    knowledge          = "onedelivery-knowledge"
    orchestrator-agent = "onedelivery-orchestrator-agent"
    guardian-agent     = "onedelivery-guardian-agent"
    logistics-agent    = "onedelivery-logistics-agent"
    resolution-agent   = "onedelivery-resolution-agent"
    qa-agent           = "onedelivery-qa-agent"
  }
}

variable "ecs_cpu" {
  description = "CPU units per ECS task (1024 = 1 vCPU)"
  type        = number
  default     = 256
}

variable "ecs_memory_mb" {
  description = "Memory per ECS task (MB)"
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "Desired number of tasks per ECS service (set to 0 to spin down and avoid Fargate cost)"
  type        = number
  default     = 0
}

variable "postgres_instance_class" {
  description = "RDS PostgreSQL instance class (db.t3.micro or db.t2.micro for free tier)"
  type        = string
  default     = "db.t3.micro"
}

variable "postgres_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "17.6"
}

variable "postgres_allocated_storage" {
  description = "Initial allocated storage in GB (20 GB for free tier)"
  type        = number
  default     = 20
}

variable "postgres_max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling in GB"
  type        = number
  default     = 20
}

variable "postgres_backup_retention_period" {
  description = "Number of days to retain backups (0-7 for free tier, 0 disables automated backups)"
  type        = number
  default     = 7
}

variable "enable_alb" {
  description = "Create ALB and API Gateway (set to false to save ~$45/month when not needed; ECS will have no external HTTP entry)"
  type        = bool
  default     = false
}

variable "enable_websocket" {
  description = "Create WebSocket API Gateway + Lambda Authorizer + DynamoDB tables for async chat (requires enable_alb = true for the HTTP side)"
  type        = bool
  default     = false
}

variable "ws_rate_limit_per_minute" {
  description = "Maximum WebSocket messages a single user may send per minute (enforced by Lambda Authorizer via DynamoDB)"
  type        = number
  default     = 20
}

variable "openai_api_key" {
  description = "OpenAI API key for all AI agent services (stored in SSM SecureString)"
  type        = string
  sensitive   = true
}

variable "langsmith_api_key" {
  description = "LangSmith API key for tracing and evaluation (stored in SSM SecureString)"
  type        = string
  sensitive   = true
  default     = "REDACTED_LANGSMITH_API_KEY"
}

variable "eval_langsmith_api_key" {
  description = "LangSmith API key used by CI eval scripts (stored in SSM SecureString)"
  type        = string
  sensitive   = true
  default     = "REDACTED_EVAL_LANGSMITH_API_KEY"
}

variable "gemini_api_key" {
  description = "Google Gemini API key (stored in SSM SecureString)"
  type        = string
  sensitive   = true
  default     = "123"
}

variable "cors_allowed_origins" {
  description = "List of origins allowed by API Gateway CORS (e.g. frontend URLs). http://localhost:5173 is always included."
  type        = list(string)
  default     = []
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC. When reusing an existing VPC, this must match its actual CIDR (for example 172.16.94.0/24)."
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_id" {
  description = "Existing VPC ID to use (e.g. vpc-0eeecdaacba51204a). Prevents Terraform from creating a new VPC."
  type        = string
}

# Optional: CIDR references (not used by Terraform; for documentation / other tooling)
variable "alb_cidr" {
  description = "Optional CIDR for ALB subnet (not used by Terraform when using existing subnets)"
  type        = string
  default     = null
}

variable "fargate_subnet_cidr" {
  description = "Optional CIDR for Fargate subnets (not used by Terraform when using existing subnets)"
  type        = string
  default     = null
}

variable "endpoints_subnet_cidr" {
  description = "Optional CIDR for VPC endpoints subnet (not used by Terraform when using existing subnets)"
  type        = string
  default     = null
}

variable "rds_subnet_cidr" {
  description = "Optional CIDR for RDS subnets (not used by Terraform when using existing subnets)"
  type        = string
  default     = null
}
