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
  description = "Aurora database name"
  type        = string
  default     = "onedelivery"
}

variable "db_username" {
  description = "Master username for Aurora (stored in SSM or set via TF_VAR)"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Master password for Aurora (set via TF_VAR_db_password)"
  type        = string
  sensitive   = true
}

variable "ecr_repository_names" {
  description = "ECR repository names for each microservice"
  type        = map(string)
  default = {
    order     = "onedelivery-order"
    logistics = "onedelivery-logistics"
    payment   = "onedelivery-payment"
    audit     = "onedelivery-audit"
    user      = "onedelivery-user"
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

variable "aurora_min_capacity" {
  description = "Aurora Serverless v2 minimum capacity (ACUs)"
  type        = number
  default     = 0.5
}

variable "aurora_max_capacity" {
  description = "Aurora Serverless v2 maximum capacity (ACUs)"
  type        = number
  default     = 4
}

variable "enable_alb" {
  description = "Create ALB and API Gateway (set to false to save ~$32/month when not needed; ECS will have no external HTTP entry)"
  type        = bool
  default     = false
}
