# Aurora Serverless v2 (PostgreSQL) - one cluster, one writer instance
resource "aws_db_subnet_group" "aurora" {
  name       = "${local.name}-aurora"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "aurora" {
  name_prefix = "${local.name}-aurora-"
  vpc_id     = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups  = [aws_security_group.ecs_tasks.id]
    description     = "ECS tasks"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier     = "${local.name}-aurora"
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  engine_version         = "17.4"
  database_name          = var.db_name
  master_username        = var.db_username
  master_password        = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_capacity
    max_capacity = var.aurora_max_capacity
  }
  skip_final_snapshot    = var.environment != "prod"
  deletion_protection    = var.environment == "prod"
}

resource "aws_rds_cluster_instance" "aurora" {
  identifier         = "${local.name}-aurora-1"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version
}
