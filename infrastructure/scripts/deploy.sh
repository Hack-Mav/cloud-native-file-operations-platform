#!/bin/bash

# Cloud-native File Operations Platform Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${PROJECT_ID:-""}
ENVIRONMENT=${ENVIRONMENT:-"dev"}
TERRAFORM_DIR="infrastructure/terraform"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if terraform is installed
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Please install it first."
        exit 1
    fi
    
    # Check if authenticated with gcloud
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        log_error "Not authenticated with gcloud. Please run 'gcloud auth login'"
        exit 1
    fi
    
    # Check if project ID is set
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
        if [ -z "$PROJECT_ID" ]; then
            log_error "PROJECT_ID is not set. Please set it as environment variable or configure gcloud project."
            exit 1
        fi
    fi
    
    log_info "Prerequisites check passed. Project ID: $PROJECT_ID"
}

setup_terraform() {
    log_info "Setting up Terraform..."
    
    cd $TERRAFORM_DIR
    
    # Initialize Terraform
    terraform init
    
    # Create terraform.tfvars if it doesn't exist
    if [ ! -f terraform.tfvars ]; then
        log_warn "terraform.tfvars not found. Creating from example..."
        cp terraform.tfvars.example terraform.tfvars
        
        # Update project_id in terraform.tfvars
        sed -i "s/your-gcp-project-id/$PROJECT_ID/g" terraform.tfvars
        
        log_warn "Please review and update terraform.tfvars with your specific values before proceeding."
        read -p "Press Enter to continue after updating terraform.tfvars..."
    fi
    
    cd - > /dev/null
}

deploy_infrastructure() {
    log_info "Deploying infrastructure..."
    
    cd $TERRAFORM_DIR
    
    # Plan the deployment
    terraform plan -var="project_id=$PROJECT_ID" -var="environment=$ENVIRONMENT"
    
    # Ask for confirmation
    read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Apply the configuration
        terraform apply -var="project_id=$PROJECT_ID" -var="environment=$ENVIRONMENT" -auto-approve
        log_info "Infrastructure deployment completed successfully!"
    else
        log_warn "Deployment cancelled by user."
        exit 0
    fi
    
    cd - > /dev/null
}

setup_app_engine() {
    log_info "Setting up App Engine services..."
    
    # Create app.yaml files for each service if they don't exist
    services=("auth-service" "file-service" "processing-service" "notification-service" "api-gateway")
    
    for service in "${services[@]}"; do
        if [ -d "services/$service" ] && [ ! -f "services/$service/app.yaml" ]; then
            log_info "Creating app.yaml for $service..."
            cat > "services/$service/app.yaml" << EOF
runtime: nodejs18
service: $service

env_variables:
  NODE_ENV: $ENVIRONMENT
  PROJECT_ID: $PROJECT_ID

vpc_access_connector:
  name: projects/$PROJECT_ID/locations/us-central1/connectors/file-ops-platform-vpc-connector

automatic_scaling:
  min_instances: 0
  max_instances: 10
  target_cpu_utilization: 0.6
EOF
        fi
    done
    
    # Create app.yaml for Go services
    go_services=("tenant-service" "audit-service" "search-service")
    
    for service in "${go_services[@]}"; do
        if [ -d "services/$service" ] && [ ! -f "services/$service/app.yaml" ]; then
            log_info "Creating app.yaml for $service..."
            cat > "services/$service/app.yaml" << EOF
runtime: go119
service: $service

env_variables:
  GO_ENV: $ENVIRONMENT
  PROJECT_ID: $PROJECT_ID

vpc_access_connector:
  name: projects/$PROJECT_ID/locations/us-central1/connectors/file-ops-platform-vpc-connector

automatic_scaling:
  min_instances: 0
  max_instances: 10
  target_cpu_utilization: 0.6
EOF
        fi
    done
    
    # Create app.yaml for Python services
    python_services=("monitoring-service")
    
    for service in "${python_services[@]}"; do
        if [ -d "services/$service" ] && [ ! -f "services/$service/app.yaml" ]; then
            log_info "Creating app.yaml for $service..."
            cat > "services/$service/app.yaml" << EOF
runtime: python39
service: $service

env_variables:
  PYTHON_ENV: $ENVIRONMENT
  PROJECT_ID: $PROJECT_ID

vpc_access_connector:
  name: projects/$PROJECT_ID/locations/us-central1/connectors/file-ops-platform-vpc-connector

automatic_scaling:
  min_instances: 0
  max_instances: 10
  target_cpu_utilization: 0.6
EOF
        fi
    done
}

main() {
    log_info "Starting deployment of Cloud-native File Operations Platform..."
    
    check_prerequisites
    setup_terraform
    deploy_infrastructure
    setup_app_engine
    
    log_info "Deployment completed successfully!"
    log_info "You can now deploy individual services using 'gcloud app deploy' in each service directory."
    log_info "Web interface will be available at: https://$PROJECT_ID.appspot.com"
}

# Run main function
main "$@"