# Infrastructure Setup

This Terraform configuration provisions the AWS resources required to host
WordSquad in production. It creates:

- An S3 bucket for the static frontend assets
- A CloudFront distribution backed by the bucket with HTTPS
- An ACM certificate for TLS
- An ECS cluster running the Flask API behind an Application Load Balancer
- A scheduled Lambda that purges idle lobbies once per day

## Usage

Publication is blocked by `privacy-publication.tf` until `privacy_operator`
contains the verified legal name, mailing address, phone, privacy email and
HTTPS website URL, and `privacy_notice_reviewed` is true. The live tfvars keep
these details empty and the review flag false until the owner supplies them.
Set the flag only after the accurate public notice is complete and reviewed.
The same gate applies to direct Terraform plans/applies and `ci-plan.sh`;
it does not check or award COPPA certification. See
[the readiness review](../../docs/COPPA_READINESS.md) for remaining work.

The API also requires `session_secret_arn`, pointing to a random signing key
of at least 32 characters in Secrets Manager or SSM. Give the execution role
permission to read/decrypt it. ECS injects it as `SECRET_KEY` and sets
`FLASK_ENV=production`; the key value must not be placed in tfvars. CloudFront
forwards `wordsquad_age_session` and routes age/game endpoints to the ALB over
HTTPS without caching. The static frontend remains on S3.

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
