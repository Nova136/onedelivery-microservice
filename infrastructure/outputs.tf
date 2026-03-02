output "account_id" {
  description = "AWS account ID"
  value       = local.account_id
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}

output "vpc_id" {
  description = "VPC ID"
  value       = data.aws_vpc.main.id
}

output "postgres_endpoint" {
  description = "RDS PostgreSQL endpoint (use for DATABASE_URL)"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "postgres_address" {
  description = "RDS PostgreSQL address (hostname only, without port)"
  value       = aws_db_instance.postgres.address
}

output "postgres_port" {
  description = "RDS PostgreSQL port"
  value       = aws_db_instance.postgres.port
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "alb_dns_name" {
  description = "ALB DNS name (use for direct HTTP access with path-based routing); null if enable_alb = false"
  value       = var.enable_alb ? aws_lb.main[0].dns_name : null
}

output "alb_zone_id" {
  description = "ALB zone ID (for Route53 alias); null if enable_alb = false"
  value       = var.enable_alb ? aws_lb.main[0].zone_id : null
}

output "api_gateway_invoke_url" {
  description = "API Gateway HTTP API invoke URL (public entry point); null if enable_alb = false"
  value       = var.enable_alb ? aws_apigatewayv2_api.main[0].api_endpoint : null
}

output "api_gateway_id" {
  description = "API Gateway HTTP API ID; null if enable_alb = false"
  value       = var.enable_alb ? aws_apigatewayv2_api.main[0].id : null
}

output "routing_note" {
  description = "How traffic is routed (when enable_alb = true)"
  value       = var.enable_alb ? "API Gateway -> ALB:80 -> path-based to ECS (/order, /logistics, /payment, /audit, /user, /incident, /orchestrator-agent, /guardian-agent, /logistic-agent, /resolution-agent, /qa-agent). Set DATABASE_URL and ensure apps expose HTTP on port 80 and GET /health for ALB." : "ALB and API Gateway disabled (enable_alb = false). No external HTTP entry to ECS."
}
