from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import os
from typing import List, Optional
import logging

from .config import Settings
from .models import (
    JobRequest, JobResponse, JobStatus, BatchJobRequest, 
    BatchJobResponse, ProcessingPipeline, JobPriority
)
from .services.job_manager import JobManager
from .services.processing_service import ProcessingService
from .services.batch_processor import BatchProcessor
from .database.datastore import DatastoreClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = Settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Processing Service...")
    
    # Initialize database connection
    datastore_client = DatastoreClient(settings.google_cloud_project)
    
    # Initialize services
    job_manager = JobManager(datastore_client, settings.redis_url)
    processing_service = ProcessingService(settings)
    batch_processor = BatchProcessor(job_manager, processing_service)
    
    # Store services in app state
    app.state.job_manager = job_manager
    app.state.processing_service = processing_service
    app.state.batch_processor = batch_processor
    app.state.datastore_client = datastore_client
    
    logger.info("Processing Service started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Processing Service...")
    await job_manager.close()
    await datastore_client.close()
    logger.info("Processing Service shutdown complete")

app = FastAPI(
    title="Processing Service",
    description="Cloud-native file processing service with batch capabilities",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "processing-service"}

# Job management endpoints
@app.post("/api/v1/jobs", response_model=JobResponse)
async def create_job(
    job_request: JobRequest,
    background_tasks: BackgroundTasks,
    job_manager: JobManager = Depends(lambda: app.state.job_manager)
):
    """Create a new processing job"""
    try:
        job = await job_manager.create_job(job_request)
        background_tasks.add_task(
            job_manager.process_job_async, 
            job.job_id
        )
        return JobResponse.from_job(job)
    except Exception as e:
        logger.error(f"Failed to create job: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job: {str(e)}"
        )

@app.get("/api/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    job_manager: JobManager = Depends(lambda: app.state.job_manager)
):
    """Get job status and details"""
    try:
        job = await job_manager.get_job(job_id)
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job not found"
            )
        return JobResponse.from_job(job)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get job: {str(e)}"
        )

@app.get("/api/v1/jobs", response_model=List[JobResponse])
async def list_jobs(
    status: Optional[JobStatus] = None,
    limit: int = 100,
    offset: int = 0,
    job_manager: JobManager = Depends(lambda: app.state.job_manager)
):
    """List jobs with optional status filter"""
    try:
        jobs = await job_manager.list_jobs(status=status, limit=limit, offset=offset)
        return [JobResponse.from_job(job) for job in jobs]
    except Exception as e:
        logger.error(f"Failed to list jobs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list jobs: {str(e)}"
        )

@app.delete("/api/v1/jobs/{job_id}")
async def cancel_job(
    job_id: str,
    job_manager: JobManager = Depends(lambda: app.state.job_manager)
):
    """Cancel a running job"""
    try:
        success = await job_manager.cancel_job(job_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job not found or cannot be cancelled"
            )
        return {"message": "Job cancelled successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel job: {str(e)}"
        )

# Batch processing endpoints
@app.post("/api/v1/batch-jobs", response_model=BatchJobResponse)
async def create_batch_job(
    batch_request: BatchJobRequest,
    background_tasks: BackgroundTasks,
    batch_processor: BatchProcessor = Depends(lambda: app.state.batch_processor)
):
    """Create a new batch processing job"""
    try:
        batch_job = await batch_processor.create_batch_job(batch_request)
        background_tasks.add_task(
            batch_processor.process_batch_job_async,
            batch_job.batch_id
        )
        return BatchJobResponse.from_batch_job(batch_job)
    except Exception as e:
        logger.error(f"Failed to create batch job: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create batch job: {str(e)}"
        )

@app.get("/api/v1/batch-jobs/{batch_id}", response_model=BatchJobResponse)
async def get_batch_job(
    batch_id: str,
    batch_processor: BatchProcessor = Depends(lambda: app.state.batch_processor)
):
    """Get batch job status and details"""
    try:
        batch_job = await batch_processor.get_batch_job(batch_id)
        if not batch_job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch job not found"
            )
        return BatchJobResponse.from_batch_job(batch_job)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get batch job {batch_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get batch job: {str(e)}"
        )

# Pipeline management endpoints
@app.get("/api/v1/pipelines", response_model=List[ProcessingPipeline])
async def list_pipelines(
    processing_service: ProcessingService = Depends(lambda: app.state.processing_service)
):
    """List available processing pipelines"""
    try:
        pipelines = await processing_service.list_pipelines()
        return pipelines
    except Exception as e:
        logger.error(f"Failed to list pipelines: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list pipelines: {str(e)}"
        )

@app.get("/api/v1/pipelines/{pipeline_id}", response_model=ProcessingPipeline)
async def get_pipeline(
    pipeline_id: str,
    processing_service: ProcessingService = Depends(lambda: app.state.processing_service)
):
    """Get pipeline details"""
    try:
        pipeline = await processing_service.get_pipeline(pipeline_id)
        if not pipeline:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pipeline not found"
            )
        return pipeline
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get pipeline {pipeline_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get pipeline: {str(e)}"
        )

@app.post("/api/v1/pipelines", response_model=ProcessingPipeline)
async def create_custom_pipeline(
    pipeline: ProcessingPipeline,
    processing_service: ProcessingService = Depends(lambda: app.state.processing_service)
):
    """Create a custom processing pipeline"""
    try:
        created_pipeline = await processing_service.create_custom_pipeline(pipeline)
        return created_pipeline
    except Exception as e:
        logger.error(f"Failed to create custom pipeline: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create custom pipeline: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8080)),
        reload=settings.environment == "development"
    )
