import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging
from pathlib import Path
import json

from ..models import (
    BatchJob, BatchJobRequest, BatchJobResponse, BatchJobProgress, 
    BatchJobResult, Job, JobStatus, JobPriority, JobRequest
)
from .job_manager import JobManager
from .processing_service import ProcessingService

logger = logging.getLogger(__name__)

class BatchProcessor:
    """Handles batch processing of multiple files with job management"""
    
    def __init__(self, job_manager: JobManager, processing_service: ProcessingService):
        self.job_manager = job_manager
        self.processing_service = processing_service
        self.active_batch_jobs: Dict[str, BatchJob] = {}
        self.batch_job_results: Dict[str, List[Job]] = {}
    
    async def create_batch_job(self, batch_request: BatchJobRequest) -> BatchJob:
        """Create a new batch processing job"""
        try:
            # Validate batch request
            if not batch_request.file_ids:
                raise ValueError("Batch job must have at least one file")
            
            # Create batch job
            batch_job = BatchJob(
                name=batch_request.name,
                file_ids=batch_request.file_ids,
                pipeline_id=batch_request.pipeline_id,
                custom_pipeline=batch_request.custom_pipeline,
                priority=batch_request.priority,
                callback_url=batch_request.callback_url,
                metadata=batch_request.metadata,
                chunk_size=batch_request.chunk_size or 50
            )
            
            # Store batch job
            self.active_batch_jobs[batch_job.batch_id] = batch_job
            self.batch_job_results[batch_job.batch_id] = []
            
            logger.info(f"Created batch job {batch_job.batch_id} with {len(batch_request.file_ids)} files")
            
            return batch_job
            
        except Exception as e:
            logger.error(f"Error creating batch job: {str(e)}")
            raise
    
    async def get_batch_job(self, batch_id: str) -> Optional[BatchJob]:
        """Get batch job by ID"""
        return self.active_batch_jobs.get(batch_id)
    
    async def process_batch_job_async(self, batch_id: str):
        """Process batch job asynchronously"""
        try:
            batch_job = self.active_batch_jobs.get(batch_id)
            if not batch_job:
                logger.error(f"Batch job {batch_id} not found")
                return
            
            # Update status to running
            batch_job.status = JobStatus.RUNNING
            batch_job.started_at = datetime.utcnow()
            
            # Initialize progress
            total_files = len(batch_job.file_ids)
            batch_job.progress = BatchJobProgress(
                total_files=total_files,
                completed_files=0,
                failed_files=0,
                running_files=0,
                pending_files=total_files,
                progress_percentage=0.0
            )
            
            logger.info(f"Starting batch job {batch_id} with {total_files} files")
            
            # Get pipeline
            pipeline = None
            if batch_job.pipeline_id:
                pipeline = await self.processing_service.get_pipeline(batch_job.pipeline_id)
            elif batch_job.custom_pipeline:
                pipeline = batch_job.custom_pipeline
            
            if not pipeline:
                await self._fail_batch_job(batch_id, "Pipeline not found")
                return
            
            # Process files in chunks
            chunk_size = batch_job.chunk_size
            file_chunks = [
                batch_job.file_ids[i:i + chunk_size] 
                for i in range(0, len(batch_job.file_ids), chunk_size)
            ]
            
            successful_jobs = []
            failed_jobs = []
            
            for chunk_index, file_chunk in enumerate(file_chunks):
                logger.info(f"Processing chunk {chunk_index + 1}/{len(file_chunks)} with {len(file_chunk)} files")
                
                # Process chunk concurrently
                chunk_tasks = []
                for file_id in file_chunk:
                    task = self._process_single_file_in_batch(
                        batch_id, file_id, pipeline, batch_job.priority
                    )
                    chunk_tasks.append(task)
                
                # Wait for chunk to complete
                chunk_results = await asyncio.gather(*chunk_tasks, return_exceptions=True)
                
                # Process results
                for i, result in enumerate(chunk_results):
                    file_id = file_chunk[i]
                    
                    if isinstance(result, Exception):
                        logger.error(f"Error processing file {file_id}: {str(result)}")
                        failed_jobs.append(file_id)
                    elif isinstance(result, Job):
                        self.batch_job_results[batch_id].append(result)
                        
                        if result.status == JobStatus.COMPLETED:
                            successful_jobs.append(file_id)
                        else:
                            failed_jobs.append(file_id)
                    
                    # Update progress
                    await self._update_batch_progress(batch_id)
            
            # Complete batch job
            await self._complete_batch_job(batch_id, successful_jobs, failed_jobs)
            
        except Exception as e:
            logger.error(f"Error processing batch job {batch_id}: {str(e)}")
            await self._fail_batch_job(batch_id, str(e))
    
    async def _process_single_file_in_batch(
        self,
        batch_id: str,
        file_id: str,
        pipeline,
        priority: JobPriority
    ) -> Job:
        """Process a single file within a batch job"""
        try:
            # Create job request
            job_request = JobRequest(
                file_id=file_id,
                pipeline_id=pipeline.pipeline_id if hasattr(pipeline, 'pipeline_id') else None,
                custom_pipeline=pipeline if hasattr(pipeline, 'steps') else None,
                priority=priority,
                metadata={'batch_id': batch_id}
            )
            
            # Create job
            job = await self.job_manager.create_job(job_request)
            
            # Process job
            await self.job_manager.process_job_async(job.job_id)
            
            # Get updated job
            updated_job = await self.job_manager.get_job(job.job_id)
            return updated_job
            
        except Exception as e:
            logger.error(f"Error processing file {file_id} in batch {batch_id}: {str(e)}")
            raise
    
    async def _update_batch_progress(self, batch_id: str):
        """Update batch job progress"""
        try:
            batch_job = self.active_batch_jobs.get(batch_id)
            if not batch_job:
                return
            
            jobs = self.batch_job_results.get(batch_id, [])
            
            completed = len([j for j in jobs if j.status == JobStatus.COMPLETED])
            failed = len([j for j in jobs if j.status == JobStatus.FAILED])
            running = len([j for j in jobs if j.status == JobStatus.RUNNING])
            pending = len(batch_job.file_ids) - completed - failed - running
            
            progress_percentage = (completed / len(batch_job.file_ids)) * 100 if batch_job.file_ids else 0
            
            batch_job.progress = BatchJobProgress(
                total_files=len(batch_job.file_ids),
                completed_files=completed,
                failed_files=failed,
                running_files=running,
                pending_files=pending,
                progress_percentage=progress_percentage
            )
            
            logger.debug(f"Batch {batch_id} progress: {progress_percentage:.1f}%")
            
        except Exception as e:
            logger.error(f"Error updating batch progress for {batch_id}: {str(e)}")
    
    async def _complete_batch_job(
        self,
        batch_id: str,
        successful_jobs: List[str],
        failed_jobs: List[str]
    ):
        """Complete batch job with results"""
        try:
            batch_job = self.active_batch_jobs.get(batch_id)
            if not batch_job:
                return
            
            batch_job.status = JobStatus.COMPLETED
            batch_job.completed_at = datetime.utcnow()
            
            # Create result
            batch_job.result = BatchJobResult(
                success=len(failed_jobs) == 0,
                total_files=len(batch_job.file_ids),
                completed_files=len(successful_jobs),
                failed_files=len(failed_jobs),
                successful_jobs=successful_jobs,
                failed_jobs=failed_jobs,
                processing_time_seconds=(
                    batch_job.completed_at - batch_job.started_at
                ).total_seconds() if batch_job.started_at else 0,
                error_summary=self._generate_error_summary(batch_id)
            )
            
            # Update final progress
            batch_job.progress = BatchJobProgress(
                total_files=len(batch_job.file_ids),
                completed_files=len(successful_jobs),
                failed_files=len(failed_jobs),
                running_files=0,
                pending_files=0,
                progress_percentage=100.0
            )
            
            # Send callback if provided
            if batch_job.callback_url:
                await self._send_batch_callback(batch_job)
            
            logger.info(f"Completed batch job {batch_id}: {len(successful_jobs)} successful, {len(failed_jobs)} failed")
            
        except Exception as e:
            logger.error(f"Error completing batch job {batch_id}: {str(e)}")
    
    async def _fail_batch_job(self, batch_id: str, error_message: str):
        """Fail batch job with error"""
        try:
            batch_job = self.active_batch_jobs.get(batch_id)
            if not batch_job:
                return
            
            batch_job.status = JobStatus.FAILED
            batch_job.completed_at = datetime.utcnow()
            batch_job.error_message = error_message
            
            # Send callback if provided
            if batch_job.callback_url:
                await self._send_batch_callback(batch_job)
            
            logger.error(f"Failed batch job {batch_id}: {error_message}")
            
        except Exception as e:
            logger.error(f"Error failing batch job {batch_id}: {str(e)}")
    
    def _generate_error_summary(self, batch_id: str) -> Dict[str, int]:
        """Generate error summary for batch job"""
        try:
            jobs = self.batch_job_results.get(batch_id, [])
            error_counts = {}
            
            for job in jobs:
                if job.status == JobStatus.FAILED and job.error_message:
                    error_type = job.error_message.split(':')[0] if ':' in job.error_message else 'unknown'
                    error_counts[error_type] = error_counts.get(error_type, 0) + 1
            
            return error_counts
            
        except Exception as e:
            logger.error(f"Error generating error summary for {batch_id}: {str(e)}")
            return {}
    
    async def _send_batch_callback(self, batch_job: BatchJob):
        """Send callback notification for batch job completion"""
        try:
            import httpx
            
            callback_data = {
                'batch_id': batch_job.batch_id,
                'status': batch_job.status,
                'name': batch_job.name,
                'total_files': len(batch_job.file_ids),
                'completed_at': batch_job.completed_at.isoformat() if batch_job.completed_at else None,
                'result': batch_job.result.dict() if batch_job.result else None,
                'error_message': batch_job.error_message
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    batch_job.callback_url,
                    json=callback_data
                )
                
                if response.status_code == 200:
                    logger.info(f"Successfully sent callback for batch {batch_job.batch_id}")
                else:
                    logger.warning(f"Callback failed for batch {batch_job.batch_id}: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"Error sending callback for batch {batch_job.batch_id}: {str(e)}")
    
    async def cancel_batch_job(self, batch_id: str) -> bool:
        """Cancel a batch job"""
        try:
            batch_job = self.active_batch_jobs.get(batch_id)
            if not batch_job:
                return False
            
            if batch_job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                return False
            
            # Cancel all running jobs in the batch
            jobs = self.batch_job_results.get(batch_id, [])
            for job in jobs:
                if job.status == JobStatus.RUNNING:
                    await self.job_manager.cancel_job(job.job_id)
            
            # Update batch job status
            batch_job.status = JobStatus.CANCELLED
            batch_job.completed_at = datetime.utcnow()
            
            # Send callback if provided
            if batch_job.callback_url:
                await self._send_batch_callback(batch_job)
            
            logger.info(f"Cancelled batch job {batch_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error cancelling batch job {batch_id}: {str(e)}")
            return False
    
    async def get_batch_job_metrics(self, batch_id: str) -> Dict[str, Any]:
        """Get detailed metrics for a batch job"""
        try:
            batch_job = self.active_batch_jobs.get(batch_id)
            if not batch_job:
                return {}
            
            jobs = self.batch_job_results.get(batch_id, [])
            
            # Calculate metrics
            total_processing_time = 0
            successful_processing_time = 0
            failed_processing_time = 0
            
            for job in jobs:
                if job.result:
                    total_processing_time += job.result.processing_time_seconds
                    
                    if job.status == JobStatus.COMPLETED:
                        successful_processing_time += job.result.processing_time_seconds
                    elif job.status == JobStatus.FAILED:
                        failed_processing_time += job.result.processing_time_seconds
            
            metrics = {
                'batch_id': batch_id,
                'total_files': len(batch_job.file_ids),
                'completed_files': len([j for j in jobs if j.status == JobStatus.COMPLETED]),
                'failed_files': len([j for j in jobs if j.status == JobStatus.FAILED]),
                'running_files': len([j for j in jobs if j.status == JobStatus.RUNNING]),
                'pending_files': len([j for j in jobs if j.status == JobStatus.PENDING]),
                'total_processing_time_seconds': total_processing_time,
                'average_processing_time_seconds': total_processing_time / len(jobs) if jobs else 0,
                'successful_processing_time_seconds': successful_processing_time,
                'failed_processing_time_seconds': failed_processing_time,
                'success_rate': (len([j for j in jobs if j.status == JobStatus.COMPLETED]) / len(jobs)) * 100 if jobs else 0,
                'failure_rate': (len([j for j in jobs if j.status == JobStatus.FAILED]) / len(jobs)) * 100 if jobs else 0
            }
            
            # Add timing information
            if batch_job.started_at:
                metrics['start_time'] = batch_job.started_at.isoformat()
                
                if batch_job.completed_at:
                    metrics['end_time'] = batch_job.completed_at.isoformat()
                    metrics['total_batch_duration_seconds'] = (
                        batch_job.completed_at - batch_job.started_at
                    ).total_seconds()
                else:
                    metrics['current_duration_seconds'] = (
                        datetime.utcnow() - batch_job.started_at
                    ).total_seconds()
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error getting batch job metrics for {batch_id}: {str(e)}")
            return {}
    
    async def list_batch_jobs(self, status: Optional[JobStatus] = None) -> List[BatchJob]:
        """List all batch jobs, optionally filtered by status"""
        try:
            batch_jobs = list(self.active_batch_jobs.values())
            
            if status:
                batch_jobs = [bj for bj in batch_jobs if bj.status == status]
            
            # Sort by creation time (newest first)
            batch_jobs.sort(key=lambda bj: bj.created_at, reverse=True)
            
            return batch_jobs
            
        except Exception as e:
            logger.error(f"Error listing batch jobs: {str(e)}")
            return []
    
    async def cleanup_completed_batch_jobs(self, older_than_hours: int = 24) -> int:
        """Clean up completed batch jobs older than specified hours"""
        try:
            cutoff_time = datetime.utcnow() - timedelta(hours=older_than_hours)
            cleaned_count = 0
            
            batch_ids_to_remove = []
            
            for batch_id, batch_job in self.active_batch_jobs.items():
                if (batch_job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED] and
                    batch_job.completed_at and batch_job.completed_at < cutoff_time):
                    
                    batch_ids_to_remove.append(batch_id)
            
            for batch_id in batch_ids_to_remove:
                del self.active_batch_jobs[batch_id]
                if batch_id in self.batch_job_results:
                    del self.batch_job_results[batch_id]
                cleaned_count += 1
            
            logger.info(f"Cleaned up {cleaned_count} completed batch jobs")
            return cleaned_count
            
        except Exception as e:
            logger.error(f"Error cleaning up batch jobs: {str(e)}")
            return 0
    
    async def get_batch_job_file_results(self, batch_id: str) -> Dict[str, Any]:
        """Get detailed results for all files in a batch job"""
        try:
            jobs = self.batch_job_results.get(batch_id, [])
            
            results = {
                'batch_id': batch_id,
                'total_files': len(jobs),
                'file_results': []
            }
            
            for job in jobs:
                file_result = {
                    'file_id': job.file_id,
                    'job_id': job.job_id,
                    'status': job.status,
                    'created_at': job.created_at.isoformat(),
                    'started_at': job.started_at.isoformat() if job.started_at else None,
                    'completed_at': job.completed_at.isoformat() if job.completed_at else None,
                    'error_message': job.error_message,
                    'processing_time_seconds': None,
                    'output_files': [],
                    'metadata': job.metadata
                }
                
                if job.result:
                    file_result['processing_time_seconds'] = job.result.processing_time_seconds
                    file_result['output_files'] = job.result.output_files
                    file_result['success'] = job.result.success
                
                results['file_results'].append(file_result)
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting batch job file results for {batch_id}: {str(e)}")
            return {}
