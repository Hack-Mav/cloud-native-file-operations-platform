#!/bin/bash

# Cloud-native File Operations Platform Cleanup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${PROJECT_ID:-""}
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
        log_error "gcloud CLI is not installed."
        exit 1
    fi
    
    # Check if terraform is installed
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed."
        exit 1
    fi
    
    # Check if project ID is set
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
        if [ -z "$PROJECT_ID" ]; then
            log_error "PROJECT_ID is not set."
            exit 1
        fi
    fi
    
    log_info "Prerequisites check passed. Project ID: $PROJECT_ID"
}

cleanup_app_engine_services() {
    log_info "Cleaning up App Engine services..."
    
    # List all services except default
    services=$(gcloud app services list --format="value(id)" --filter="id!=default" 2>/dev/null || true)
    
    if [ -n "$services" ]; then
        for service in $services; do
            log_info "Deleting App Engine service: $service"
            gcloud app services delete $service --quiet || log_warn "Failed to delete service $service"
        done
    else
        log_info "No App Engine services to delete"
    fi
}

cleanup_infrastructure() {
    log_info "Cleaning up infrastructure with Terraform..."
    
    cd $TERRAFORM_DIR
    
    # Destroy infrastructure
    log_warn "This will destroy ALL infrastructure resources!"
    read -p "Are you sure you want to proceed? Type 'yes' to confirm: " -r
    echo
    if [[ $REPLY == "yes" ]]; then
        terraform destroy -var="project_id=$PROJECT_ID" -auto-approve
        log_info "Infrastructure cleanup completed!"
    else
        log_warn "Cleanup cancelled by user."
        exit 0
    fi
    
    cd - > /dev/null
}

cleanup_storage_buckets() {
    log_info "Cleaning up storage buckets..."
    
    # List buckets with project prefix
    buckets=$(gsutil ls -p $PROJECT_ID | grep "gs://$PROJECT_ID-" || true)
    
    if [ -n "$buckets" ]; then
        for bucket in $buckets; do
            log_info "Deleting bucket: $bucket"
            gsutil -m rm -r $bucket || log_warn "Failed to delete bucket $bucket"
        done
    else
        log_info "No storage buckets to delete"
    fi
}

main() {
    log_warn "This script will clean up ALL resources for the Cloud-native File Operations Platform!"
    log_warn "This action is IRREVERSIBLE and will delete all data!"
    
    read -p "Are you absolutely sure you want to proceed? Type 'DELETE' to confirm: " -r
    echo
    if [[ $REPLY != "DELETE" ]]; then
        log_info "Cleanup cancelled."
        exit 0
    fi
    
    check_prerequisites
    cleanup_app_engine_services
    cleanup_storage_buckets
    cleanup_infrastructure
    
    log_info "Cleanup completed successfully!"
    log_warn "Please verify that all resources have been deleted in the Google Cloud Console."
}

# Run main function
main "$@"