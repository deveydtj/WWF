# Deployment Guide

This guide outlines the steps to deploy the Wordle With Friends infrastructure and API using Terraform and GitHub Actions.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) 1.4 or newer
- AWS account with permissions to create S3, DynamoDB, ECS and related resources
- Docker installed locally if building images manually
- AWS CLI configured with your credentials

## Bootstrap Steps

1. **Remote State**
   - Create an S3 bucket and DynamoDB table for Terraform state and locking.
   - Update `infra/live/variables.tfvars` with the bucket name, region and table.
   - Run `terraform init -backend-config="bucket=<state-bucket>" -backend-config="dynamodb_table=<lock-table>"` inside `infra/terraform`.

2. **Initial Apply**
   - Populate `infra/live/variables.tfvars` with the required variables such as `aws_region`, `frontend_bucket`, `domain`, `vpc_id`, `subnets`, `ecs_task_execution_role` and `api_image`.
   - Execute `terraform plan -var-file=infra/live/variables.tfvars` and review the output.
   - Apply with `terraform apply -var-file=infra/live/variables.tfvars`.

3. **GitHub Secrets**
   - Add the following repository secrets so the CI workflow can deploy:
     `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPO`, `TF_VAR_domain` and `CF_DISTRIBUTION_ID`.

4. **CI/CD**
   - The workflow runs tests and `terraform plan` on every pull request. Deployments occur automatically when changes land on `main` and the required secrets are present.

Refer to `infra/terraform/README.md` for details on the Terraform modules.
