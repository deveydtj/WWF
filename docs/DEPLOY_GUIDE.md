# Deployment Guide

This guide outlines the steps to deploy the WordSquad infrastructure and API using Terraform and GitHub Actions.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) 1.4 or newer
- AWS account with permissions to create S3, DynamoDB, ECS and related resources
- Docker installed locally if building images manually
- AWS CLI configured with your credentials
- Domain name registered (or access to DNS configuration)

## Step-by-Step Deployment

### Step 1: AWS Prerequisites Setup

1. **Configure AWS CLI**
   ```bash
   # Install AWS CLI v2 if not already installed
   # Configure with your AWS credentials
   aws configure
   
   # Verify access
   aws sts get-caller-identity
   ```

2. **Create S3 Bucket for Terraform State**
   ```bash
   # Replace 'your-unique-bucket-name' with a globally unique name
   aws s3 mb s3://your-unique-terraform-state-bucket
   aws s3api put-bucket-versioning --bucket your-unique-terraform-state-bucket --versioning-configuration Status=Enabled
   ```

3. **Create DynamoDB Table for State Locking**
   ```bash
   aws dynamodb create-table \
     --table-name terraform-lock-table \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1
   ```

4. **Create ECS Task Execution Role** (if not exists)
   ```bash
   # This role is needed for ECS tasks to pull images and write logs
   aws iam create-role --role-name ecsTaskExecutionRole \
     --assume-role-policy-document file://trust-policy.json
   aws iam attach-role-policy --role-name ecsTaskExecutionRole \
     --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
   ```

### Step 2: Network Configuration

1. **Use Existing VPC** or create a new one with:
   - At least 2 public subnets in different AZs
   - Internet Gateway attached
   - Route tables configured for internet access

2. **Note the VPC and Subnet IDs** for the Terraform configuration

### Step 3: Configure Terraform Variables

1. **Update `infra/live/variables.tfvars`** with your actual values:
   ```hcl
   aws_region = "us-east-1"
   frontend_bucket = "your-unique-frontend-bucket-name"
   domain = "your-actual-domain.com"
   vpc_id = "vpc-your-actual-vpc-id"
   subnets = ["subnet-your-subnet-1", "subnet-your-subnet-2"]
   ecs_task_execution_role = "arn:aws:iam::YOUR-ACCOUNT:role/ecsTaskExecutionRole"
   api_image = "YOUR-ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/wwf:latest"
   state_bucket = "your-unique-terraform-state-bucket"
   lock_table = "terraform-lock-table"
   ```

## Bootstrap Steps

1. **Remote State**
   - Navigate to `infra/terraform` directory
   - Initialize Terraform with remote backend:
   ```bash
   cd infra/terraform
   terraform init \
     -backend-config="bucket=your-unique-terraform-state-bucket" \
     -backend-config="dynamodb_table=terraform-lock-table" \
     -backend-config="region=us-east-1"
   ```

2. **Initial Apply**
   ```bash
   # Review the plan
   terraform plan -var-file=../live/variables.tfvars
   
   # Apply if everything looks correct
   terraform apply -var-file=../live/variables.tfvars
   ```

3. **GitHub Secrets**
   Add the following repository secrets for CI/CD:
   - `AWS_ACCESS_KEY_ID` - Your AWS access key
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret key  
   - `AWS_ACCOUNT_ID` - Your 12-digit AWS account number
   - `AWS_REGION` - Your AWS region (e.g., us-east-1)
   - `ECR_REPO` - Set to `wwf-api`
   - `TF_VAR_domain` - Your domain name
   - `CF_DISTRIBUTION_ID` - CloudFront distribution ID (get from Terraform output)

4. **CI/CD**
   - The workflow runs tests and `terraform plan` on every pull request
   - Deployments occur automatically when changes land on `main` and the required secrets are present

## Post-Deployment Steps

1. **DNS Configuration**
   - Point your domain to the CloudFront distribution (get URL from Terraform output)
   - Wait for DNS propagation (can take up to 48 hours)

2. **SSL Certificate**
   - ACM certificate should be automatically validated via DNS
   - Check AWS Certificate Manager console for status

3. **Test Deployment**
   - Visit your domain to verify the application is working
   - Check the health endpoint: `https://your-domain.com/health`

## Troubleshooting

- **VPC/Subnet Issues**: Ensure subnets are in different AZs and have internet access
- **IAM Permission Issues**: Ensure your AWS user has necessary permissions for all resources
- **Domain Issues**: Verify DNS settings and certificate validation
- **ECR Issues**: Ensure ECR repository exists and is accessible

Refer to `infra/terraform/README.md` for details on the Terraform modules.
