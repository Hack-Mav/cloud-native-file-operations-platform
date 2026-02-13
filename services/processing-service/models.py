from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Union
from enum import Enum
from datetime import datetime
import uuid

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class JobPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

class ProcessingType(str, Enum):
    IMAGE_RESIZE = "image_resize"
    IMAGE_FORMAT_CONVERT = "image_format_convert"
    DOCUMENT_TEXT_EXTRACT = "document_text_extract"
    DOCUMENT_PDF_GENERATE = "document_pdf_generate"
    VIDEO_THUMBNAIL = "video_thumbnail"
    VIDEO_COMPRESS = "video_compress"
    CONTENT_ANALYSIS = "content_analysis"
    CUSTOM = "custom"

class PipelineStep(BaseModel):
    step_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    processing_type: ProcessingType
    parameters: Dict[str, Any] = Field(default_factory=dict)
    depends_on: List[str] = Field(default_factory=list)
    timeout_seconds: int = Field(default=300)
    retry_count: int = Field(default=3)
    
    class Config:
        use_enum_values = True

class ProcessingPipeline(BaseModel):
    pipeline_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    steps: List[PipelineStep]
    input_formats: List[str] = Field(default_factory=list)
    output_formats: List[str] = Field(default_factory=list)
    is_custom: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('steps')
    def validate_steps(cls, v):
        if not v:
            raise ValueError('Pipeline must have at least one step')
        return v

class JobRequest(BaseModel):
    file_id: str
    pipeline_id: Optional[str] = None
    custom_pipeline: Optional[ProcessingPipeline] = None
    priority: JobPriority = JobPriority.MEDIUM
    callback_url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    @validator('pipeline_id', always=True)
    def validate_pipeline(cls, v, values):
        if 'custom_pipeline' not in values or not values['custom_pipeline']:
            if not v:
                raise ValueError('Either pipeline_id or custom_pipeline must be provided')
        return v

class JobProgress(BaseModel):
    current_step: int
    total_steps: int
    step_name: str
    progress_percentage: float
    message: Optional[str] = None

class JobResult(BaseModel):
    success: bool
    output_files: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    processing_time_seconds: float

class Job(BaseModel):
    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    file_id: str
    pipeline_id: Optional[str] = None
    custom_pipeline: Optional[ProcessingPipeline] = None
    status: JobStatus = JobStatus.PENDING
    priority: JobPriority = JobPriority.MEDIUM
    progress: Optional[JobProgress] = None
    result: Optional[JobResult] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    worker_id: Optional[str] = None
    callback_url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        use_enum_values = True

class JobResponse(BaseModel):
    job_id: str
    file_id: str
    pipeline_id: Optional[str] = None
    status: JobStatus
    priority: JobPriority
    progress: Optional[JobProgress] = None
    result: Optional[JobResult] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    worker_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    @classmethod
    def from_job(cls, job: Job) -> "JobResponse":
        return cls(
            job_id=job.job_id,
            file_id=job.file_id,
            pipeline_id=job.pipeline_id,
            status=job.status,
            priority=job.priority,
            progress=job.progress,
            result=job.result,
            error_message=job.error_message,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            worker_id=job.worker_id,
            metadata=job.metadata
        )

class BatchJobRequest(BaseModel):
    name: str
    file_ids: List[str]
    pipeline_id: Optional[str] = None
    custom_pipeline: Optional[ProcessingPipeline] = None
    priority: JobPriority = JobPriority.MEDIUM
    callback_url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    chunk_size: Optional[int] = None
    
    @validator('file_ids')
    def validate_file_ids(cls, v):
        if not v:
            raise ValueError('Batch job must have at least one file')
        if len(v) > 1000:
            raise ValueError('Batch job cannot have more than 1000 files')
        return v

class BatchJobProgress(BaseModel):
    total_files: int
    completed_files: int
    failed_files: int
    running_files: int
    pending_files: int
    progress_percentage: float

class BatchJobResult(BaseModel):
    success: bool
    total_files: int
    completed_files: int
    failed_files: int
    successful_jobs: List[str] = Field(default_factory=list)
    failed_jobs: List[str] = Field(default_factory=list)
    processing_time_seconds: float
    error_summary: Dict[str, int] = Field(default_factory=dict)

class BatchJob(BaseModel):
    batch_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    file_ids: List[str]
    pipeline_id: Optional[str] = None
    custom_pipeline: Optional[ProcessingPipeline] = None
    status: JobStatus = JobStatus.PENDING
    priority: JobPriority = JobPriority.MEDIUM
    progress: Optional[BatchJobProgress] = None
    result: Optional[BatchJobResult] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    callback_url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    chunk_size: int = 50
    
    class Config:
        use_enum_values = True

class BatchJobResponse(BaseModel):
    batch_id: str
    name: str
    file_ids: List[str]
    pipeline_id: Optional[str] = None
    status: JobStatus
    priority: JobPriority
    progress: Optional[BatchJobProgress] = None
    result: Optional[BatchJobResult] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    @classmethod
    def from_batch_job(cls, batch_job: BatchJob) -> "BatchJobResponse":
        return cls(
            batch_id=batch_job.batch_id,
            name=batch_job.name,
            file_ids=batch_job.file_ids,
            pipeline_id=batch_job.pipeline_id,
            status=batch_job.status,
            priority=batch_job.priority,
            progress=batch_job.progress,
            result=batch_job.result,
            error_message=batch_job.error_message,
            created_at=batch_job.created_at,
            started_at=batch_job.started_at,
            completed_at=batch_job.completed_at,
            metadata=batch_job.metadata
        )

class WorkerMetrics(BaseModel):
    worker_id: str
    status: str  # idle, busy, scaling_up, scaling_down
    current_jobs: int
    max_concurrent_jobs: int
    cpu_usage: float
    memory_usage: float
    last_heartbeat: datetime
    jobs_completed: int
    jobs_failed: int
    average_processing_time: float

class ScaleDecision(BaseModel):
    action: str  # scale_up, scale_down, no_action
    target_workers: int
    reason: str
    current_workers: int
    metrics: Dict[str, Any]

class ResourceAllocation(BaseModel):
    job_id: str
    worker_id: str
    allocated_cpu: float
    allocated_memory: float
    allocated_disk: float
    estimated_duration: int
    priority_score: int
