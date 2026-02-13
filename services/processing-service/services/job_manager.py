import asyncio
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging
from pathlib import Path
import uuid

from ..models import (
    Job, JobRequest, JobStatus, JobPriority, JobProgress, JobResult
)
from .processing_service import ProcessingService
from ..database.datastore import DatastoreClient

logger = logging.getLogger(__name__)

class JobManager:
    """Manages processing jobs with queue and priority handling"""
    
    def __init__(self, datastore_client: DatastoreClient, redis_url: str):
        self.datastore_client = datastore_client
        self.redis_url = redis_url
        self.active_jobs: Dict[str, Job] = {}
        self.job_queue = asyncio.PriorityQueue()
        self.processing_service: Optional[ProcessingService] = None
        self.worker_tasks: Dict[str, asyncio.Task] = {}
        self.max_concurrent_jobs = 10
        self.current_jobs_count = 0
        
    async def initialize(self, processing_service: ProcessingService):
        """Initialize job manager with processing service"""
        self.processing_service = processing_service
        
        # Load existing jobs from database
        await self._load_active_jobs()
        
        # Start worker tasks
        await self._start_workers()
        
        logger.info("Job manager initialized")
    
    async def create_job(self, job_request: JobRequest) -> Job:
        """Create a new processing job"""
        try:
            # Create job
            job = Job(
                file_id=job_request.file_id,
                pipeline_id=job_request.pipeline_id,
                custom_pipeline=job_request.custom_pipeline,
                priority=job_request.priority,
                callback_url=job_request.callback_url,
                metadata=job_request.metadata
            )
            
            # Store job in memory
            self.active_jobs[job.job_id] = job
            
            # Save job to database
            await self._save_job(job)
            
            # Add to queue with priority
            priority_value = self._get_priority_value(job.priority)
            await self.job_queue.put((priority_value, job.job_id))
            
            logger.info(f"Created job {job.job_id} for file {job.file_id}")
            
            return job
            
        except Exception as e:
            logger.error(f"Error creating job: {str(e)}")
            raise
    
    async def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID"""
        # Check memory first
        if job_id in self.active_jobs:
            return self.active_jobs[job_id]
        
        # Load from database
        job = await self._load_job(job_id)
        if job:
            self.active_jobs[job_id] = job
        
        return job
    
    async def list_jobs(
        self, 
        status: Optional[JobStatus] = None, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[Job]:
        """List jobs with optional status filter"""
        try:
            # Query from database
            jobs = await self._query_jobs(status, limit, offset)
            
            # Update memory cache
            for job in jobs:
                self.active_jobs[job.job_id] = job
            
            return jobs
            
        except Exception as e:
            logger.error(f"Error listing jobs: {str(e)}")
            return []
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a job"""
        try:
            job = await self.get_job(job_id)
            if not job:
                return False
            
            if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                return False
            
            # Update job status
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.utcnow()
            
            # Save to database
            await self._save_job(job)
            
            # Cancel worker task if running
            if job_id in self.worker_tasks:
                task = self.worker_tasks[job_id]
                task.cancel()
                del self.worker_tasks[job_id]
                self.current_jobs_count -= 1
            
            # Send callback if provided
            if job.callback_url:
                await self._send_job_callback(job)
            
            logger.info(f"Cancelled job {job_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error cancelling job {job_id}: {str(e)}")
            return False
    
    async def process_job_async(self, job_id: str):
        """Process a job asynchronously"""
        try:
            job = await self.get_job(job_id)
            if not job:
                logger.error(f"Job {job_id} not found")
                return
            
            # Check if job can be processed
            if job.status != JobStatus.PENDING:
                logger.warning(f"Job {job_id} is not in pending status: {job.status}")
                return
            
            # Update job status
            job.status = JobStatus.RUNNING
            job.started_at = datetime.utcnow()
            await self._save_job(job)
            
            # Get file path (in production, this would come from file service)
            file_path = await self._get_file_path(job.file_id)
            if not file_path:
                await self._fail_job(job_id, "File not found")
                return
            
            # Get pipeline
            pipeline = None
            if job.pipeline_id:
                pipeline = await self.processing_service.get_pipeline(job.pipeline_id)
            elif job.custom_pipeline:
                pipeline = job.custom_pipeline
            
            if not pipeline:
                await self._fail_job(job_id, "Pipeline not found")
                return
            
            # Process file
            start_time = datetime.utcnow()
            
            result = await self.processing_service.process_file(
                file_path,
                pipeline,
                job,
                progress_callback=self._update_job_progress
            )
            
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Update job with result
            if result['success']:
                job.status = JobStatus.COMPLETED
                job.result = JobResult(
                    success=True,
                    output_files=result.get('processed_files', []),
                    metadata=result.get('metadata', {}),
                    processing_time_seconds=processing_time
                )
            else:
                job.status = JobStatus.FAILED
                job.error_message = result.get('error', 'Unknown error')
                job.result = JobResult(
                    success=False,
                    output_files=[],
                    metadata={},
                    error_message=job.error_message,
                    processing_time_seconds=processing_time
                )
            
            job.completed_at = datetime.utcnow()
            
            # Save job
            await self._save_job(job)
            
            # Send callback if provided
            if job.callback_url:
                await self._send_job_callback(job)
            
            logger.info(f"Completed job {job_id} with status: {job.status}")
            
        except Exception as e:
            logger.error(f"Error processing job {job_id}: {str(e)}")
            await self._fail_job(job_id, str(e))
        
        finally:
            # Clean up worker task
            if job_id in self.worker_tasks:
                del self.worker_tasks[job_id]
                self.current_jobs_count -= 1
    
    async def _update_job_progress(self, job_id: str, progress: JobProgress):
        """Update job progress"""
        try:
            job = await self.get_job(job_id)
            if job:
                job.progress = progress
                await self._save_job(job)
        except Exception as e:
            logger.error(f"Error updating job progress for {job_id}: {str(e)}")
    
    async def _fail_job(self, job_id: str, error_message: str):
        """Mark job as failed"""
        try:
            job = await self.get_job(job_id)
            if job:
                job.status = JobStatus.FAILED
                job.error_message = error_message
                job.completed_at = datetime.utcnow()
                
                if job.result is None:
                    job.result = JobResult(
                        success=False,
                        output_files=[],
                        metadata={},
                        error_message=error_message,
                        processing_time_seconds=0
                    )
                
                await self._save_job(job)
                
                # Send callback if provided
                if job.callback_url:
                    await self._send_job_callback(job)
                
                logger.error(f"Failed job {job_id}: {error_message}")
        except Exception as e:
            logger.error(f"Error failing job {job_id}: {str(e)}")
    
    def _get_priority_value(self, priority: JobPriority) -> int:
        """Convert priority to numeric value for queue"""
        priority_map = {
            JobPriority.URGENT: 1,
            JobPriority.HIGH: 2,
            JobPriority.MEDIUM: 3,
            JobPriority.LOW: 4
        }
        return priority_map.get(priority, 3)
    
    async def _start_workers(self):
        """Start worker tasks"""
        for i in range(self.max_concurrent_jobs):
            task = asyncio.create_task(self._worker(f"worker-{i}"))
            self.worker_tasks[f"worker-{i}"] = task
    
    async def _worker(self, worker_id: str):
        """Worker task that processes jobs from queue"""
        logger.info(f"Started worker {worker_id}")
        
        while True:
            try:
                # Wait for job from queue
                priority, job_id = await self.job_queue.get()
                
                # Check if we can process more jobs
                if self.current_jobs_count >= self.max_concurrent_jobs:
                    # Put job back in queue and wait
                    await self.job_queue.put((priority, job_id))
                    await asyncio.sleep(1)
                    continue
                
                # Get job
                job = await self.get_job(job_id)
                if not job or job.status != JobStatus.PENDING:
                    continue
                
                # Process job
                self.current_jobs_count += 1
                task = asyncio.create_task(self.process_job_async(job_id))
                self.worker_tasks[job_id] = task
                
                # Wait for job to complete
                try:
                    await task
                except asyncio.CancelledError:
                    logger.info(f"Job {job_id} was cancelled")
                except Exception as e:
                    logger.error(f"Error in job {job_id}: {str(e)}")
                
            except Exception as e:
                logger.error(f"Error in worker {worker_id}: {str(e)}")
                await asyncio.sleep(5)
    
    async def _load_active_jobs(self):
        """Load active jobs from database"""
        try:
            jobs = await self._query_jobs(status=None, limit=1000, offset=0)
            
            for job in jobs:
                if job.status in [JobStatus.PENDING, JobStatus.RUNNING]:
                    self.active_jobs[job.job_id] = job
                    
                    # Re-queue pending jobs
                    if job.status == JobStatus.PENDING:
                        priority_value = self._get_priority_value(job.priority)
                        await self.job_queue.put((priority_value, job.job_id))
            
            logger.info(f"Loaded {len(self.active_jobs)} active jobs")
            
        except Exception as e:
            logger.error(f"Error loading active jobs: {str(e)}")
    
    async def _save_job(self, job: Job):
        """Save job to database"""
        try:
            await self.datastore_client.save_job(job)
        except Exception as e:
            logger.error(f"Error saving job {job.job_id}: {str(e)}")
    
    async def _load_job(self, job_id: str) -> Optional[Job]:
        """Load job from database"""
        try:
            return await self.datastore_client.get_job(job_id)
        except Exception as e:
            logger.error(f"Error loading job {job_id}: {str(e)}")
            return None
    
    async def _query_jobs(
        self, 
        status: Optional[JobStatus], 
        limit: int, 
        offset: int
    ) -> List[Job]:
        """Query jobs from database"""
        try:
            return await self.datastore_client.query_jobs(status, limit, offset)
        except Exception as e:
            logger.error(f"Error querying jobs: {str(e)}")
            return []
    
    async def _get_file_path(self, file_id: str) -> Optional[str]:
        """Get file path from file service"""
        try:
            # In production, this would call the file service API
            # For now, return a placeholder path
            return f"/tmp/files/{file_id}"
        except Exception as e:
            logger.error(f"Error getting file path for {file_id}: {str(e)}")
            return None
    
    async def _send_job_callback(self, job: Job):
        """Send callback notification for job completion"""
        try:
            import httpx
            
            callback_data = {
                'job_id': job.job_id,
                'file_id': job.file_id,
                'status': job.status,
                'created_at': job.created_at.isoformat(),
                'started_at': job.started_at.isoformat() if job.started_at else None,
                'completed_at': job.completed_at.isoformat() if job.completed_at else None,
                'error_message': job.error_message,
                'result': job.result.dict() if job.result else None,
                'progress': job.progress.dict() if job.progress else None
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    job.callback_url,
                    json=callback_data
                )
                
                if response.status_code == 200:
                    logger.info(f"Successfully sent callback for job {job.job_id}")
                else:
                    logger.warning(f"Callback failed for job {job.job_id}: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"Error sending callback for job {job.job_id}: {str(e)}")
    
    async def get_job_metrics(self) -> Dict[str, Any]:
        """Get job processing metrics"""
        try:
            # Get counts by status
            total_jobs = len(self.active_jobs)
            pending_jobs = len([j for j in self.active_jobs.values() if j.status == JobStatus.PENDING])
            running_jobs = len([j for j in self.active_jobs.values() if j.status == JobStatus.RUNNING])
            completed_jobs = len([j for j in self.active_jobs.values() if j.status == JobStatus.COMPLETED])
            failed_jobs = len([j for j in self.active_jobs.values() if j.status == JobStatus.FAILED])
            
            # Calculate processing times
            completed_job_times = []
            for job in self.active_jobs.values():
                if job.result and job.result.processing_time_seconds:
                    completed_job_times.append(job.result.processing_time_seconds)
            
            avg_processing_time = sum(completed_job_times) / len(completed_job_times) if completed_job_times else 0
            
            metrics = {
                'total_jobs': total_jobs,
                'pending_jobs': pending_jobs,
                'running_jobs': running_jobs,
                'completed_jobs': completed_jobs,
                'failed_jobs': failed_jobs,
                'current_queue_size': self.job_queue.qsize(),
                'active_workers': len([t for t in self.worker_tasks.values() if not t.done()]),
                'average_processing_time_seconds': avg_processing_time,
                'success_rate': (completed_jobs / (completed_jobs + failed_jobs)) * 100 if (completed_jobs + failed_jobs) > 0 else 0
            }
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error getting job metrics: {str(e)}")
            return {}
    
    async def close(self):
        """Close job manager and cleanup"""
        try:
            # Cancel all worker tasks
            for task_id, task in self.worker_tasks.items():
                if not task.done():
                    task.cancel()
            
            # Wait for tasks to complete
            if self.worker_tasks:
                await asyncio.gather(*self.worker_tasks.values(), return_exceptions=True)
            
            logger.info("Job manager closed")
            
        except Exception as e:
            logger.error(f"Error closing job manager: {str(e)}")
