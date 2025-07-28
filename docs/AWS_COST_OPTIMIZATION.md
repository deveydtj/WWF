# AWS Cost Optimization Guide for WWF

This document outlines the cost optimization measures implemented to keep AWS usage within the Free Tier limits and minimize expenses.

## ⚠️ High Cost Risks Addressed

### 1. Auto Scaling Configuration
**Previous Risk**: Auto scaling could spawn up to 10 ECS Fargate instances, quickly consuming Free Tier allowances.

**Optimizations Applied**:
- Reduced max capacity from 10 to 2 instances
- Increased CPU threshold from 70% to 85%
- Increased memory threshold from 80% to 90%
- Added scheduled scaling to scale down to 0 instances during off-hours (11 PM - 6 AM UTC)

### 2. ECS Fargate Always-On Service
**Current Configuration**:
- 1 task minimum, 2 tasks maximum
- 256 CPU units (0.25 vCPU)
- 512 MB memory
- Scales down to 0 during off-hours to save costs

### 3. Application Load Balancer
**Cost Impact**: ~$16-22/month base cost (not covered by Free Tier)
**Consideration**: For development environments, consider direct ECS service access to avoid ALB costs.

## 💰 Cost Monitoring & Alerts

### Budget Controls
- **Monthly Budget**: $10 limit for development environment
- **Alerts**: 
  - 80% budget utilization warning
  - 100% budget exceeded alert
- **Cost Alarm**: Triggers at $8 spending

### Resource Tagging
All resources tagged with:
```
Project: WWF
Environment: development
Purpose: [specific-function]
```

## 📊 Resource Cost Breakdown

### Free Tier Eligible Resources
- **ECS Fargate**: 750 compute hours/month (with optimizations should stay well within)
- **ALB**: First 750 hours free (first month only)
- **CloudFront**: 50 GB data transfer out, 2M HTTP requests
- **S3**: 5 GB storage, 20,000 GET requests, 2,000 PUT requests
- **Lambda**: 1M requests, 400,000 GB-seconds compute time

### Paid Resources (After Free Tier)
- Application Load Balancer: ~$16-22/month base cost
- ECS Fargate: $0.04048/vCPU hour, $0.004445/GB hour (after 750 hours)
- Data transfer costs
- CloudWatch logs storage

## 🕒 Scheduled Operations

### Daily Scaling Schedule
- **11 PM UTC**: Scale down to 0 instances (saves ~9 hours daily)
- **6 AM UTC**: Scale back up to normal operation
- **Cost Savings**: ~37.5% reduction in ECS compute hours

### Weekly Cleanup
- **Daily 5 AM UTC**: Lambda function cleans up old game lobbies
- **Cost**: Minimal (well within Lambda Free Tier)

## 🚀 Deployment Best Practices

### CI/CD Optimizations
- Deploy only on push to main branch (not on PRs)
- Reuse Docker images instead of rebuilding for each deployment
- Targeted CloudFront cache invalidation (specific paths only)

### Development Workflow
1. Use local Docker development (`npm run dev` or `docker-compose up`)
2. Test thoroughly before pushing to main
3. Monitor AWS costs through AWS Console or budget alerts
4. Scale manually if needed for testing: `aws ecs update-service --cluster wwf --service wwf-api --desired-count N`

## 📋 Monitoring Commands

### Check Current ECS Service Status
```bash
aws ecs describe-services --cluster wwf --services wwf-api --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount,PendingCount:pendingCount}'
```

### View Current Month Costs
```bash
aws ce get-dimension-values --dimension Service --time-period Start=2024-01-01,End=2024-01-31 --granularity MONTHLY
```

### Manual Scaling Commands
```bash
# Scale down for cost savings
aws ecs update-service --cluster wwf --service wwf-api --desired-count 0

# Scale back up
aws ecs update-service --cluster wwf --service wwf-api --desired-count 1
```

## 🛠️ Emergency Cost Controls

If costs are still high:

1. **Immediate Actions**:
   ```bash
   # Stop all ECS tasks
   aws ecs update-service --cluster wwf --service wwf-api --desired-count 0
   
   # Disable auto scaling
   aws application-autoscaling deregister-scalable-target --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id service/wwf/wwf-api
   ```

2. **Terraform Destroy** (Nuclear Option):
   ```bash
   cd infra/terraform
   terraform destroy -var-file=../live/variables.tfvars
   ```

3. **Check CloudTrail** for unexpected API calls:
   ```bash
   aws logs describe-log-groups --log-group-name-prefix "/aws/cloudtrail"
   ```

## 📈 Further Optimizations

### Consider for Production
- Use Reserved Instances for predictable workloads
- Implement CloudWatch detailed monitoring for better scaling decisions
- Use Spot Instances for non-critical workloads
- Implement blue-green deployments to reduce downtime costs

### Alternative Architectures
- **Serverless**: AWS Lambda + API Gateway (more cost-effective for low traffic)
- **ECS on EC2**: More control over costs but requires more management
- **AWS Lightsail**: Fixed monthly pricing for predictable costs

## 🔍 Troubleshooting High Costs

### Common Causes
1. **Multiple ECS tasks running**: Check auto scaling policies
2. **High data transfer**: Monitor CloudFront and ALB metrics
3. **Excessive logging**: Check CloudWatch log retention and volume
4. **Unexpected traffic**: Monitor ALB access logs
5. **Resource leaks**: Check for orphaned resources in AWS Console

### Investigation Steps
1. Check AWS Cost Explorer for service breakdown
2. Review CloudWatch metrics for unusual spikes
3. Audit resource tags to identify untagged resources
4. Check ECS service events for scaling activities
5. Review CloudTrail for unexpected API calls

## 📞 Support

If costs remain high after implementing these optimizations:
1. Review AWS Trusted Advisor recommendations
2. Contact AWS Support (Free Tier support available)
3. Consider AWS Well-Architected Framework review
4. Implement AWS Cost Anomaly Detection

---

**Last Updated**: When implementing cost optimizations
**Next Review**: Monthly cost review recommended