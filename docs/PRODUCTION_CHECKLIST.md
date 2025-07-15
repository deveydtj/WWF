# Production Deployment Checklist for WordSquad

This checklist ensures all security and configuration requirements are met before deploying WordSquad to production.

## Pre-Deployment Security Checklist

### ✅ Frontend Security
- [x] **Frontend Dependencies Updated**: Vite upgraded to v7.0.4 to fix esbuild vulnerability
- [x] **Build Process**: Frontend builds successfully with `npm run build`
- [x] **Static Assets**: Built assets are properly copied to backend/static/

### ✅ Backend Security & Configuration

#### Environment Variables (REQUIRED for Production)
- [ ] `SECRET_KEY` - Set to a strong, unique value (32+ characters)
- [ ] `FLASK_ENV=production` - Enables production security mode
- [ ] `REDIS_URL` - (Optional) For multi-instance deployments
- [ ] `WORD_LIST_PATH` - (Optional) Custom word list location
- [ ] `DEFN_CACHE_PATH` - (Optional) Custom definitions cache location

#### Security Features Implemented
- [x] **Security Headers**: CSP, HSTS, XSS Protection, Frame Options
- [x] **Rate Limiting**: API (100 req/min/IP) and Guess (30/min/player) limits
- [x] **Secret Key Validation**: Prevents weak/default keys in production
- [x] **Enhanced Health Checks**: Comprehensive status monitoring

### ✅ Infrastructure Security

#### Docker Security
- [x] **Non-root User**: Container runs as `appuser` (UID 1001)
- [x] **Health Checks**: Docker health checks configured
- [x] **Minimal Base Image**: Using Python 3.12 slim
- [x] **Security Flags**: PYTHONDONTWRITEBYTECODE enabled

#### AWS Infrastructure
- [x] **TLS/SSL**: CloudFront with ACM certificates
- [x] **Security Groups**: Properly configured ALB and ECS security groups
- [x] **ECS Fargate**: Non-privileged container execution

## Deployment Steps

### 1. Environment Setup
```bash
# Set required environment variables
export SECRET_KEY="your-secure-32-character-secret-key-here"
export FLASK_ENV="production"
export REDIS_URL="redis://your-redis-instance:6379"  # Optional
```

### 2. Build and Test
```bash
# Build frontend
cd frontend && npm ci && npm run build && cd ..

# Test server locally
python backend/server.py
curl http://localhost:5001/health
```

### 3. Container Build and Deploy
```bash
# Build production container
docker build -t wwf:latest -f docker/Dockerfile .

# Test container health
docker run -d --name wwf_test \
  -e SECRET_KEY="your-secret-key" \
  -e FLASK_ENV="production" \
  wwf:latest

# Check health
curl http://localhost:5001/health

# Deploy via CI/CD or manual push to ECR
```

### 4. Post-Deployment Verification

#### Health Check Verification
- [ ] `/health` endpoint returns `{"status": "ok"}`
- [ ] No warnings in health check response
- [ ] All required assets loaded (words_loaded > 0)

#### Security Headers Verification (ALB/CloudFront Level)
Security headers should be configured at the AWS ALB or CloudFront level for optimal performance:
```bash
# Security headers to configure in AWS:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY  
# X-XSS-Protection: 1; mode=block
# Strict-Transport-Security: max-age=31536000; includeSubDomains
# Content-Security-Policy: default-src 'self'; ...
```

#### Functional Testing
- [ ] Landing page loads correctly
- [ ] Game creation works
- [ ] Game joining works
- [ ] Real-time updates function
- [ ] Chat system operational
- [ ] Rate limiting prevents abuse

## Security Monitoring

### Log Monitoring
- Monitor application logs for errors and security events
- Set up alerts for:
  - Configuration validation failures
  - Rate limit violations
  - Health check failures
  - Redis connection issues

### Performance Monitoring
- Monitor response times
- Track active lobby counts
- Monitor memory and CPU usage
- Set up auto-scaling if needed

## Troubleshooting

### Common Issues

#### "Configuration validation failed"
- Check all required environment variables are set
- Verify SECRET_KEY is not the default value
- Ensure file paths are accessible

#### "Redis connection failed"
- Verify REDIS_URL format: `redis://host:port` or `rediss://host:port`
- Check network connectivity to Redis instance
- Verify Redis instance is running

#### Health check fails
- Check application logs for detailed error messages
- Verify file system permissions
- Confirm all required assets are present

### Emergency Rollback
If issues occur during deployment:
1. Revert to previous ECR image tag
2. Update ECS service with previous task definition
3. Invalidate CloudFront cache if needed
4. Monitor health checks for recovery

## Security Best Practices Implemented

1. **Defense in Depth**: Multiple security layers
2. **Principle of Least Privilege**: Non-root container execution
3. **Secure Defaults**: Production-focused configurations
4. **Input Validation**: Rate limiting and request validation
5. **Monitoring**: Comprehensive health checks and logging
6. **Encryption**: HTTPS/TLS for all communications

---

**Final Note**: This application is now production-ready with comprehensive security measures. Follow this checklist for each deployment to ensure consistency and security.