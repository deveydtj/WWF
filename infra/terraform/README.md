# Infrastructure Setup

This Terraform configuration provisions the AWS resources required to host
Wordle With Friends in production. It creates:

- An S3 bucket for the static frontend assets
- A CloudFront distribution backed by the bucket with HTTPS
- An ACM certificate for TLS
- An ECS cluster running the Flask API behind an Application Load Balancer

## Usage

1. Install [Terraform](https://www.terraform.io/downloads.html) 1.4 or newer.
2. Set the required variables in `terraform.tfvars` or via the CLI:

```
terraform init
terraform apply \
  -var aws_region=us-east-1 \
  -var frontend_bucket=my-wwf-frontend \
  -var domain=play.example.com \
  -var vpc_id=vpc-123456 \
  -var subnets="[subnet-abc,subnet-def]" \
  -var ecs_task_execution_role=arn:aws:iam::123456:role/ecsTaskExec \
  -var api_image=123456.dkr.ecr.us-east-1.amazonaws.com/wwf:latest
```

This is a minimal configuration and may need to be adjusted for your
environment. DNS validation records for the ACM certificate should be created
manually or with additional Terraform resources.
