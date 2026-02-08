# Deployment Guide

This guide covers the deployment of the Cloud-native File Operations Platform to Google Cloud Platform.

## Prerequisites

Before deploying, ensure you have the following:

1. **Google Cloud Account**: Active GCP account with billing enabled
2. **Google Cloud SDK**: Installed and configured
3. **Terraform**: Version 1.0 or higher
4. **Node.js**: Version 18 or higher
5. **Go**: Version 1.19 or higher
6. **Python**: Version 3.9 or higher

## Initial Setup

### 1. Create Google Cloud Project

```bash
# Create a new project
gcloud projects create YOUR_PROJECT_ID --name="File Operations Platform"

# Set the project as default
gcloud config set project YOUR_PROJECT_ID

# Enable billing (required for most services)
gcloud billing projects link YOUR_PROJECT_ID --billing-account=YOUR_BILLING_ACCOUNT_ID
```

### 2. Configure Authentication

```bash
# Authenticate with Google Cloud
gcloud auth login

# Create application default credentials
gcloud auth application-default login
```

### 3. Clone and Setup Repository

```bash
# Clone the repository
git clone <repository-url>
cd cloud-native-file-operations-platform

# Install dependencies
npm run install:all
```

## Infrastructure Deployment

### 1. Configure Terraform Variables

```bash
# Copy the example variables file
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your specific values
nano terraform.tfvars
```

Required variables:
- `project_id`: Your GCP project ID
- `notification_email`: Email for monitoring alerts
- `region`: Primary deployment region (default: us-central1)

### 2. Deploy Infrastructure

```bash
# Make the deployment script executable
chmod +x infrastructure/scripts/deploy.sh

# Run the deployment script
./infrastructure/scripts/deploy.sh
```

Or manually:

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Plan the deployment
terraform plan

# Apply the configuration
terraform apply
```

### 3. Verify Infrastructure

After deployment, verify that the following resources are created:

- App Engine application
- VPC network and subnets
- Cloud SQL instance
- Cloud Storage buckets
- Redis instance
- Pub/Sub topics
- KMS key ring and keys
- IAM service accounts

## Service Deployment

### 1. Build Services

```bash
# Build all services
npm run build

# Or build individual services
cd services/auth-service && npm run build
cd services/file-service && go build
cd services/processing-service && pip install -r requirements.txt
```

### 2. Deploy to App Engine

Deploy each service individually:

```bash
# Deploy authentication service
cd services/auth-service
gcloud app deploy

# Deploy file service
cd services/file-service
gcloud app deploy

# Deploy processing service
cd services/processing-service
gcloud app deploy

# Deploy notification service
cd services/notification-service
gcloud app deploy

# Deploy API gateway
cd services/api-gateway
gcloud app deploy

# Deploy web interface (default service)
cd web-interface
npm run build
gcloud app deploy
```

### 3. Configure Service Communication

Update the `app.yaml` files in each service to use the correct project ID:

```bash
# Replace PROJECT_ID placeholder in all app.yaml files
find . -name "app.yaml" -exec sed -i "s/PROJECT_ID/YOUR_PROJECT_ID/g" {} \;
```

## Environment Configuration

### 1. Development Environment

```bash
# Set environment variables for development
export NODE_ENV=development
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
export REDIS_HOST=localhost
export REDIS_PORT=6379
```

### 2. Production Environment

Production environment variables are configured in the `app.yaml` files and Terraform outputs.

## Monitoring and Logging

### 1. Enable Monitoring

The deployment automatically sets up:

- Cloud Monitoring for metrics
- Cloud Logging for centralized logs
- Error Reporting for error tracking
- Cloud Trace for distributed tracing

### 2. Configure Alerts

```bash
# Create alerting policies
gcloud alpha monitoring policies create --policy-from-file=monitoring/alerting-policy.yaml
```

### 3. Access Dashboards

- **Cloud Console**: https://console.cloud.google.com
- **Monitoring**: https://console.cloud.google.com/monitoring
- **Logging**: https://console.cloud.google.com/logs

## Security Configuration

### 1. IAM Roles

The deployment creates a service account with minimal required permissions:

- `roles/datastore.user`
- `roles/storage.objectAdmin`
- `roles/pubsub.publisher`
- `roles/pubsub.subscriber`
- `roles/cloudsql.client`
- `roles/redis.editor`
- `roles/cloudkms.cryptoKeyEncrypterDecrypter`

### 2. Network Security

- VPC with private subnets
- Firewall rules for internal communication
- VPC Access Connector for App Engine

### 3. Data Encryption

- Encryption at rest using Cloud KMS
- TLS encryption for data in transit
- Encrypted Cloud SQL backups

## Scaling Configuration

### 1. Auto Scaling

App Engine services are configured with automatic scaling:

```yaml
automatic_scaling:
  min_instances: 0
  max_instances: 10
  target_cpu_utilization: 0.6
```

### 2. Database Scaling

- Cloud SQL with automatic storage increase
- Read replicas for high-traffic scenarios
- Connection pooling for efficient resource usage

### 3. Storage Scaling

- Cloud Storage with automatic scaling
- Lifecycle policies for cost optimization
- Multi-region replication for availability

## Backup and Recovery

### 1. Automated Backups

- Cloud SQL automated backups (7-day retention)
- Point-in-time recovery enabled
- Cross-region backup storage

### 2. Disaster Recovery

- Multi-region deployment capability
- Automated failover procedures
- Recovery time objective (RTO): < 1 hour
- Recovery point objective (RPO): < 15 minutes

## Troubleshooting

### Common Issues

1. **App Engine Deployment Fails**
   ```bash
   # Check service logs
   gcloud app logs tail -s SERVICE_NAME
   ```

2. **Database Connection Issues**
   ```bash
   # Verify VPC connector
   gcloud compute networks vpc-access connectors describe CONNECTOR_NAME --region=REGION
   ```

3. **Storage Access Issues**
   ```bash
   # Check IAM permissions
   gcloud projects get-iam-policy PROJECT_ID
   ```

### Support

For deployment issues:

1. Check the [troubleshooting guide](TROUBLESHOOTING.md)
2. Review service logs in Cloud Console
3. Contact the development team

## Cleanup

To remove all resources:

```bash
# Run the cleanup script
chmod +x infrastructure/scripts/cleanup.sh
./infrastructure/scripts/cleanup.sh
```

**Warning**: This will permanently delete all data and resources.

## Next Steps

After successful deployment:

1. Configure DNS and custom domains
2. Set up CI/CD pipelines
3. Configure monitoring dashboards
4. Perform security audits
5. Load testing and performance optimization