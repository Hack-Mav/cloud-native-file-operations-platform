# Cloud-native File Operations Platform - Main Terraform Configuration

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# Configure the Google Cloud Provider
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "appengine.googleapis.com",
    "cloudsql.googleapis.com",
    "storage.googleapis.com",
    "datastore.googleapis.com",
    "redis.googleapis.com",
    "pubsub.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudkms.googleapis.com",
    "containerregistry.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com"
  ])

  service = each.key
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

# App Engine Application
resource "google_app_engine_application" "app" {
  project       = var.project_id
  location_id   = var.app_engine_location
  database_type = "CLOUD_DATASTORE_COMPATIBILITY"

  depends_on = [google_project_service.required_apis]
}

# VPC Network
resource "google_compute_network" "vpc_network" {
  name                    = "${var.project_name}-vpc"
  auto_create_subnetworks = false
  mtu                     = 1460

  depends_on = [google_project_service.required_apis]
}

# Subnet for services
resource "google_compute_subnetwork" "services_subnet" {
  name          = "${var.project_name}-services-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
  network       = google_compute_network.vpc_network.id

  secondary_ip_range {
    range_name    = "services-secondary-range"
    ip_cidr_range = "192.168.1.0/24"
  }
}

# Subnet for databases
resource "google_compute_subnetwork" "database_subnet" {
  name          = "${var.project_name}-database-subnet"
  ip_cidr_range = "10.0.2.0/24"
  region        = var.region
  network       = google_compute_network.vpc_network.id
}

# Private Service Connection for Cloud SQL
resource "google_compute_global_address" "private_ip_address" {
  name          = "${var.project_name}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc_network.id

  depends_on = [google_project_service.required_apis]
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]

  depends_on = [google_project_service.required_apis]
}

# VPC Access Connector for App Engine
resource "google_vpc_access_connector" "connector" {
  name          = "${var.project_name}-vpc-connector"
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc_network.name
  region        = var.region

  depends_on = [google_project_service.required_apis]
}

# Firewall rules
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.project_name}-allow-internal"
  network = google_compute_network.vpc_network.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = ["10.0.0.0/8", "192.168.0.0/16"]
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "${var.project_name}-allow-ssh"
  network = google_compute_network.vpc_network.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ssh-allowed"]
}

resource "google_compute_firewall" "allow_http_https" {
  name    = "${var.project_name}-allow-http-https"
  network = google_compute_network.vpc_network.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8080"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http-server", "https-server"]
}

# Cloud Storage buckets
resource "google_storage_bucket" "file_storage" {
  name          = "${var.project_id}-file-storage"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_storage_bucket" "backup_storage" {
  name          = "${var.project_id}-backup-storage"
  location      = var.backup_region
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  depends_on = [google_project_service.required_apis]
}

# Cloud SQL instance for metadata
resource "google_sql_database_instance" "main" {
  name             = "${var.project_name}-db-instance"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-f1-micro"

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc_network.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 7
      }
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
  }

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
    google_project_service.required_apis
  ]
}

# Cloud SQL databases
resource "google_sql_database" "auth_db" {
  name     = "auth_service"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_database" "file_db" {
  name     = "file_service"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_database" "audit_db" {
  name     = "audit_service"
  instance = google_sql_database_instance.main.name
}

# Redis instance for caching
resource "google_redis_instance" "cache" {
  name           = "${var.project_name}-redis-cache"
  tier           = "STANDARD_HA"
  memory_size_gb = 1
  region         = var.region

  authorized_network = google_compute_network.vpc_network.id

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }

  depends_on = [google_project_service.required_apis]
}

# Pub/Sub topics for event-driven architecture
resource "google_pubsub_topic" "file_events" {
  name = "${var.project_name}-file-events"

  depends_on = [google_project_service.required_apis]
}

resource "google_pubsub_topic" "processing_events" {
  name = "${var.project_name}-processing-events"

  depends_on = [google_project_service.required_apis]
}

resource "google_pubsub_topic" "audit_events" {
  name = "${var.project_name}-audit-events"

  depends_on = [google_project_service.required_apis]
}

# Cloud KMS for encryption
resource "google_kms_key_ring" "main" {
  name     = "${var.project_name}-keyring"
  location = var.region

  depends_on = [google_project_service.required_apis]
}

resource "google_kms_crypto_key" "file_encryption_key" {
  name     = "file-encryption-key"
  key_ring = google_kms_key_ring.main.id

  lifecycle {
    prevent_destroy = true
  }
}

# Container Registry (if using flexible environment)
resource "google_container_registry" "registry" {
  project  = var.project_id
  location = "US"

  depends_on = [google_project_service.required_apis]
}

# IAM roles and service accounts
resource "google_service_account" "app_engine_sa" {
  account_id   = "${var.project_name}-appengine-sa"
  display_name = "App Engine Service Account"
  description  = "Service account for App Engine services"
}

resource "google_project_iam_member" "app_engine_permissions" {
  for_each = toset([
    "roles/datastore.user",
    "roles/storage.objectAdmin",
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
    "roles/cloudsql.client",
    "roles/redis.editor",
    "roles/cloudkms.cryptoKeyEncrypterDecrypter",
    "roles/monitoring.metricWriter",
    "roles/logging.logWriter"
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.app_engine_sa.email}"
}

# Monitoring and alerting
resource "google_monitoring_notification_channel" "email" {
  display_name = "Email Notification Channel"
  type         = "email"

  labels = {
    email_address = var.notification_email
  }

  depends_on = [google_project_service.required_apis]
}

# Security scanning configuration
resource "google_binary_authorization_policy" "policy" {
  admission_whitelist_patterns {
    name_pattern = "gcr.io/${var.project_id}/*"
  }

  default_admission_rule {
    evaluation_mode  = "REQUIRE_ATTESTATION"
    enforcement_mode = "ENFORCED_BLOCK_AND_AUDIT_LOG"

    require_attestations_by = [
      google_binary_authorization_attestor.attestor.name,
    ]
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_binary_authorization_attestor" "attestor" {
  name = "${var.project_name}-attestor"

  attestation_authority_note {
    note_reference = google_container_analysis_note.note.name

    public_keys {
      ascii_armored_pgp_public_key = file("${path.module}/pgp-key.pub")
    }
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_container_analysis_note" "note" {
  name = "${var.project_name}-attestor-note"

  attestation_authority {
    hint {
      human_readable_name = "Attestor Note"
    }
  }

  depends_on = [google_project_service.required_apis]
}