#!/bin/bash
# Emergency AWS Cost Control Script
# Run this script if AWS costs are too high and you need to quickly shut down resources

set -e

echo "🚨 EMERGENCY: Shutting down AWS resources to control costs"
echo "This will stop all running ECS tasks and scale services to 0"

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS CLI not configured. Please configure AWS credentials first:"
    echo "   aws configure"
    exit 1
fi

# Get current region
REGION=$(aws configure get region)
if [ -z "$REGION" ]; then
    echo "❌ AWS region not set. Please set it:"
    echo "   aws configure set region us-east-1"
    exit 1
fi

echo "🌍 Using AWS region: $REGION"

# Scale down ECS service to 0
echo "📉 Scaling down ECS service to 0 tasks..."
aws ecs update-service \
    --cluster wwf \
    --service wwf-api \
    --desired-count 0 \
    --region $REGION || echo "⚠️  ECS service not found or already scaled down"

# Wait for tasks to stop
echo "⏳ Waiting for tasks to stop..."
sleep 30

# Check current running tasks
RUNNING_TASKS=$(aws ecs describe-services --cluster wwf --services wwf-api --region $REGION --query 'services[0].runningCount' --output text 2>/dev/null || echo "0")
echo "📊 Current running tasks: $RUNNING_TASKS"

# Disable auto scaling temporarily
echo "🔒 Disabling auto scaling..."
aws application-autoscaling deregister-scalable-target \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id service/wwf/wwf-api \
    --region $REGION || echo "⚠️  Auto scaling target not found or already disabled"

# List current costs for today
echo "💰 Checking estimated costs for current month..."
START_DATE=$(date -d "$(date +'%Y-%m-01')" +'%Y-%m-%d')
END_DATE=$(date +'%Y-%m-%d')

aws ce get-cost-and-usage \
    --time-period Start=$START_DATE,End=$END_DATE \
    --granularity MONTHLY \
    --metrics BlendedCost \
    --region us-east-1 || echo "⚠️  Could not retrieve cost information"

echo ""
echo "✅ Emergency shutdown complete!"
echo ""
echo "📋 Resources that are still running (and incurring costs):"
echo "   - Application Load Balancer (~$0.75/day)"
echo "   - CloudFront Distribution (minimal cost for low traffic)"
echo "   - S3 bucket (minimal cost for small storage)"
echo "   - Lambda function (minimal cost, runs once daily)"
echo ""
echo "🔧 To restart services later:"
echo "   aws ecs update-service --cluster wwf --service wwf-api --desired-count 1 --region $REGION"
echo ""
echo "🛑 To completely destroy all resources (IRREVERSIBLE):"
echo "   cd infra/terraform && terraform destroy -var-file=../live/variables.tfvars"
echo ""
echo "📊 Monitor costs at: https://console.aws.amazon.com/billing/home#/bills"