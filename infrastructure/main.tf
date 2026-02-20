terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment and set for remote state (e.g. S3 + DynamoDB)
  # backend "s3" {
  #   bucket         = "onedelivery-terraform-state"
  #   key            = "infrastructure/terraform.tfstate"
  #   region         = "ap-southeast-1"
  #   dynamodb_table = "onedelivery-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "onedelivery"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  account_id = data.aws_caller_identity.current.account_id
  azs        = slice(data.aws_availability_zones.available.names, 0, 3)
  name       = "onedelivery"
}
