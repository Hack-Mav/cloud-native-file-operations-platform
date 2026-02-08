# Variables for Cloud-native File Operations Platform

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "project_name" {
  description = "The project name used for resource naming"
  type        = string
  default     = "file-ops-platform"
}

variable "region" {
  description = "The GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The GCP zone for resources"
  type        = string
  default     = "us-central1-a"
}

variable "app_engine_location" {
  description = "The location for App Engine application"
  type        = string
  default     = "us-central"
}

variable "backup_region" {
  description = "The region for backup storage"
  type        = string
  default     = "us-east1"
}

variable "notification_email" {
  description = "Email address for monitoring notifications"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "enable_apis" {
  description = "Whether to enable required APIs"
  type        = bool
  default     = true
}

variable "enable_monitoring" {
  description = "Whether to enable monitoring and alerting"
  type        = bool
  default     = true
}

variable "enable_security_scanning" {
  description = "Whether to enable container security scanning"
  type        = bool
  default     = true
}

variable "redis_memory_size_gb" {
  description = "Memory size for Redis instance in GB"
  type        = number
  default     = 1
}

variable "sql_tier" {
  description = "The machine type for Cloud SQL instance"
  type        = string
  default     = "db-f1-micro"
}

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

variable "storage_lifecycle_nearline_days" {
  description = "Days after which to move objects to Nearline storage"
  type        = number
  default     = 30
}

variable "storage_lifecycle_coldline_days" {
  description = "Days after which to move objects to Coldline storage"
  type        = number
  default     = 90
}

variable "storage_lifecycle_archive_days" {
  description = "Days after which to move objects to Archive storage"
  type        = number
  default     = 365
}