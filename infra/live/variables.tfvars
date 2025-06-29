aws_region = "us-east-1"
frontend_bucket = "my-wwf-frontend"
domain = "play.example.com"
vpc_id = "vpc-123456"
subnets = ["subnet-abc","subnet-def"]
ecs_task_execution_role = "arn:aws:iam::123456:role/ecsTaskExec"
api_image = "123456.dkr.ecr.us-east-1.amazonaws.com/wwf:latest"
# Remote state configuration
state_bucket = "terraform-state-bucket"
lock_table = "terraform-lock-table"
