# AWS Quick Start Guide

**You've created your AWS account - here's what to do next!**

## Immediate Next Steps (30 minutes)

### 1. Secure Your AWS Account
```bash
# Enable MFA on your root account (highly recommended)
# Create an IAM user for deployments instead of using root
```

### 2. Install Required Tools
```bash
# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install Terraform
wget https://releases.hashicorp.com/terraform/1.4.6/terraform_1.4.6_linux_amd64.zip
unzip terraform_1.4.6_linux_amd64.zip
sudo mv terraform /usr/local/bin/
```

### 3. Configure AWS Access
```bash
# Configure AWS CLI with your credentials
aws configure
# AWS Access Key ID: [Your access key]
# AWS Secret Access Key: [Your secret key]  
# Default region name: us-east-1
# Default output format: json

# Test your access
aws sts get-caller-identity
```

### 4. Choose Your Deployment Region
Pick an AWS region close to your users:
- **us-east-1** (N. Virginia) - Most services, cheapest
- **us-west-2** (Oregon) - West coast USA
- **eu-west-1** (Ireland) - Europe
- **ap-southeast-1** (Singapore) - Asia

### 5. Set Up Your Domain
You need a domain name for the application:
- **Option A**: Register new domain in Route 53
- **Option B**: Use existing domain (you'll need DNS access)

## Infrastructure Setup (15 minutes)

### 1. Create Terraform State Infrastructure
```bash
# Replace with your unique bucket name
BUCKET_NAME="your-name-wwf-terraform-state"
REGION="us-east-1"

# Create S3 bucket for Terraform state
aws s3 mb s3://$BUCKET_NAME --region $REGION
aws s3api put-bucket-versioning --bucket $BUCKET_NAME --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name terraform-lock-table \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --region $REGION
```

### 2. Create ECS Task Execution Role
```bash
# Create trust policy file
cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the role
aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://trust-policy.json
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Clean up
rm trust-policy.json
```

### 3. Set Up Networking (if needed)
If you don't have a VPC with public subnets:
```bash
# This will create a VPC with public subnets
aws ec2 create-default-vpc
```

## Configuration (10 minutes)

### 1. Get Your AWS Account Details
```bash
# Get your account ID
aws sts get-caller-identity --query Account --output text

# Get your default VPC ID
aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text

# Get subnet IDs from your VPC
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text)
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[].SubnetId" --output table
```

### 2. Update Configuration Files
Edit `infra/live/variables.tfvars` with your actual values:
```hcl
aws_region = "us-east-1"  # Your chosen region
frontend_bucket = "your-name-wwf-frontend"  # Must be globally unique
domain = "yourdomain.com"  # Your actual domain
vpc_id = "vpc-xxxxxxxxx"  # From step above
subnets = ["subnet-xxxxxx", "subnet-yyyyyy"]  # From step above  
ecs_task_execution_role = "arn:aws:iam::YOUR-ACCOUNT-ID:role/ecsTaskExecutionRole"
api_image = "YOUR-ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com/wwf:latest"
state_bucket = "your-name-wwf-terraform-state"  # From step 1
lock_table = "terraform-lock-table"
```

## Ready to Deploy!

You're now ready to follow the main [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) starting from the "Bootstrap Steps" section.

## Cost Estimate

Expected monthly AWS costs for light usage:
- **S3**: $1-5 (storage and requests)
- **CloudFront**: $1-3 (CDN)
- **ECS Fargate**: $15-30 (container hosting)
- **ALB**: $16 (load balancer)
- **Route 53**: $0.50 (hosted zone)
- **Total**: ~$35-55/month

## Need Help?

- Check [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) for deployment verification
- See [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) for detailed deployment steps
- Review [ARCHITECTURE.md](ARCHITECTURE.md) to understand the infrastructure