# Outputs for Cloud-native File Operations Platform

output "project_id" {
  description = "The GCP project ID"
  value       = var.project_id
}

output "app_engine_url" {
  description = "The URL of the App Engine application"
  value       = "https://${var.project_id}.appspot.com"
}

output "vpc_network_name" {
  description = "The name of the VPC network"
  value       = google_compute_network.vpc_network.name
}

output "vpc_network_id" {
  description = "The ID of the VPC network"
  value       = google_compute_network.vpc_network.id
}

output "services_subnet_name" {
  description = "The name of the services subnet"
  value       = google_compute_subnetwork.services_subnet.name
}

output "database_subnet_name" {
  description = "The name of the database subnet"
  value       = google_compute_subnetwork.database_subnet.name
}

output "vpc_connector_name" {
  description = "The name of the VPC Access Connector"
  value       = google_vpc_access_connector.connector.name
}

output "file_storage_bucket_name" {
  description = "The name of the file storage bucket"
  value       = google_storage_bucket.file_storage.name
}

output "backup_storage_bucket_name" {
  description = "The name of the backup storage bucket"
  value       = google_storage_bucket.backup_storage.name
}

output "sql_instance_name" {
  description = "The name of the Cloud SQL instance"
  value       = google_sql_database_instance.main.name
}

output "sql_instance_connection_name" {
  description = "The connection name of the Cloud SQL instance"
  value       = google_sql_database_instance.main.connection_name
}

output "sql_instance_private_ip" {
  description = "The private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.main.private_ip_address
}

output "redis_instance_host" {
  description = "The IP address of the Redis instance"
  value       = google_redis_instance.cache.host
}

output "redis_instance_port" {
  description = "The port of the Redis instance"
  value       = google_redis_instance.cache.port
}

output "pubsub_topics" {
  description = "The names of the Pub/Sub topics"
  value = {
    file_events       = google_pubsub_topic.file_events.name
    processing_events = google_pubsub_topic.processing_events.name
    audit_events      = google_pubsub_topic.audit_events.name
  }
}

output "kms_key_ring_name" {
  description = "The name of the KMS key ring"
  value       = google_kms_key_ring.main.name
}

output "file_encryption_key_name" {
  description = "The name of the file encryption key"
  value       = google_kms_crypto_key.file_encryption_key.name
}

output "service_account_email" {
  description = "The email of the App Engine service account"
  value       = google_service_account.app_engine_sa.email
}

output "container_registry_url" {
  description = "The URL of the Container Registry"
  value       = "gcr.io/${var.project_id}"
}

output "monitoring_notification_channel_name" {
  description = "The name of the monitoring notification channel"
  value       = google_monitoring_notification_channel.email.name
}