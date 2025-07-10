# Infrastructure Setup

This Terraform configuration provisions the AWS resources required to host
WordSquad in production. It creates:

- An S3 bucket for the static frontend assets
- A CloudFront distribution backed by the bucket with HTTPS
- An ACM certificate for TLS
- An ECS cluster running the Flask API behind an Application Load Balancer
- A scheduled Lambda that purges idle lobbies once per day

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
-var api_image=123456.dkr.ecr.us-east-1.amazonaws.com/wwf:latest \
-var enable_efs=true
```

`enable_efs` provisions an EFS file system and mounts it at `/data`, setting the
`GAME_FILE` path accordingly.

If your word list or definitions cache are stored outside the image, override
`WORD_LIST_PATH` and `DEFN_CACHE_PATH` in the ECS task definition. They default
to the bundled files under `/app/data`.

The configuration also builds a small Lambda function that hits the `/internal/purge`
endpoint on the API each morning to clean up idle or finished lobbies. The ALB
DNS name is passed to the function via the `API_URL` environment variable.

This is a minimal configuration and may need to be adjusted for your
environment. DNS validation records for the ACM certificate should be created
manually or with additional Terraform resources.
