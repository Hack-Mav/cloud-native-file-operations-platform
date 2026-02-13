from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    # Application settings
    app_name: str = "Processing Service"
    environment: str = os.getenv("PYTHON_ENV", "development")
    debug: bool = environment == "development"
    
    # Google Cloud settings
    google_cloud_project: str = os.getenv("GOOGLE_CLOUD_PROJECT", "PROJECT_ID")
    google_cloud_location: str = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    
    # Storage settings
    storage_bucket: str = os.getenv("STORAGE_BUCKET", "file-ops-platform-storage")
    
    # Database settings
    datastore_namespace: str = os.getenv("DATASTORE_NAMESPACE", "processing-service")
    
    # Redis settings
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    redis_password: Optional[str] = os.getenv("REDIS_PASSWORD")
    
    # Processing settings
    max_file_size: int = int(os.getenv("MAX_FILE_SIZE", "1073741824"))  # 1GB
    temp_dir: str = os.getenv("TEMP_DIR", "/tmp/processing")
    max_concurrent_jobs: int = int(os.getenv("MAX_CONCURRENT_JOBS", "10"))
    job_timeout: int = int(os.getenv("JOB_TIMEOUT", "3600"))  # 1 hour
    
    # Worker settings
    worker_scale_up_threshold: float = float(os.getenv("WORKER_SCALE_UP_THRESHOLD", "0.8"))
    worker_scale_down_threshold: float = float(os.getenv("WORKER_SCALE_DOWN_THRESHOLD", "0.2"))
    min_workers: int = int(os.getenv("MIN_WORKERS", "2"))
    max_workers: int = int(os.getenv("MAX_WORKERS", "20"))
    
    # Security settings
    allowed_origins: List[str] = os.getenv("ALLOWED_ORIGINS", "*").split(",")
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "your-secret-key")
    
    # Processing pipeline settings
    image_processing_enabled: bool = os.getenv("IMAGE_PROCESSING_ENABLED", "true").lower() == "true"
    document_processing_enabled: bool = os.getenv("DOCUMENT_PROCESSING_ENABLED", "true").lower() == "true"
    video_processing_enabled: bool = os.getenv("VIDEO_PROCESSING_ENABLED", "true").lower() == "true"
    
    # External service settings
    content_analysis_api_key: Optional[str] = os.getenv("CONTENT_ANALYSIS_API_KEY")
    content_analysis_endpoint: str = os.getenv("CONTENT_ANALYSIS_ENDPOINT", "")
    
    # Batch processing settings
    max_batch_size: int = int(os.getenv("MAX_BATCH_SIZE", "1000"))
    batch_chunk_size: int = int(os.getenv("BATCH_CHUNK_SIZE", "50"))
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
