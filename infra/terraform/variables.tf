variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "frontend_bucket" {
  description = "S3 bucket name for static frontend"
  type        = string
}

variable "domain" {
  description = "Domain name for TLS certificate"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for ALB and ECS"
  type        = string
}

variable "subnets" {
  description = "Subnets for ALB/ECS"
  type        = list(string)
}

variable "ecs_task_execution_role" {
  description = "IAM role for ECS task execution"
  type        = string
}

variable "api_image" {
  description = "Docker image for the Flask API"
  type        = string
}

variable "single_instance" {
  description = "Run the API in single instance mode"
  type        = bool
  default     = true
}

variable "enable_efs" {
  description = "Mount an EFS volume for shared JSON persistence"
  type        = bool
  default     = false
}

