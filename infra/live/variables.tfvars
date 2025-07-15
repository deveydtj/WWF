# Terraform Variables Configuration
# Copy this file and update all values before deployment

# AWS Configuration
aws_region = "us-east-1"  # Your preferred AWS region

# Frontend S3 Bucket (must be globally unique)
frontend_bucket = "your-wwf-frontend-bucket-name"  # Replace with unique bucket name

# Domain Configuration
domain = "your-domain.com"  # Replace with your registered domain

# Network Configuration (Use your existing VPC or create new one)
vpc_id = "vpc-123456"  # Replace with your VPC ID
subnets = ["subnet-abc","subnet-def"]  # Replace with your subnet IDs (minimum 2)

# IAM Configuration
ecs_task_execution_role = "arn:aws:iam::123456:role/ecsTaskExecution"  # Create or use existing ECS task execution role

# Container Configuration
api_image = "123456.dkr.ecr.us-east-1.amazonaws.com/wwf:latest"  # Will be updated by CI/CD

# Optional: EFS Storage (set to true if you want persistent storage)
# enable_efs = true

# Terraform State Configuration (for remote state backend)
state_bucket = "your-terraform-state-bucket"  # S3 bucket for Terraform state
lock_table = "your-terraform-lock-table"     # DynamoDB table for state locking
