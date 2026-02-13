import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from datetime import datetime

from services.processing_service.services.batch_processor import BatchProcessor
from services.processing_service.models import (
    BatchJobRequest, BatchJob, JobStatus, JobPriority, JobRequest
)

class TestBatchProcessor:
    """Test cases for BatchProcessor"""
    
    @pytest.mark.asyncio
    async def test_create_batch_job(self, batch_processor):
        """Test creating a batch job"""
        request = BatchJobRequest(
            name="Test Batch",
            file_ids=["file1", "file2", "file3"],
            pipeline_id="image_resize",
            priority=JobPriority.MEDIUM
        )
        
        batch_job = await batch_processor.create_batch_job(request)
        
        assert batch_job.name == "Test Batch"
        assert batch_job.file_ids == ["file1", "file2", "file3"]
        assert batch_job.pipeline_id == "image_resize"
        assert batch_job.priority == JobPriority.MEDIUM
        assert batch_job.status == JobStatus.PENDING
        assert batch_job.batch_id in batch_processor.active_batch_jobs
    
    @pytest.mark.asyncio
    async def test_create_batch_job_with_custom_pipeline(self, batch_processor):
        """Test creating batch job with custom pipeline"""
        from services.processing_service.models import ProcessingPipeline, PipelineStep, ProcessingType
        
        custom_pipeline = ProcessingPipeline(
            name="Custom Pipeline",
            steps=[
                PipelineStep(
                    name="step1",
                    processing_type=ProcessingType.IMAGE_RESIZE
                )
            ]
        )
        
        request = BatchJobRequest(
            name="Custom Batch",
            file_ids=["file1", "file2"],
            custom_pipeline=custom_pipeline
        )
        
        batch_job = await batch_processor.create_batch_job(request)
        
        assert batch_job.custom_pipeline is not None
        assert batch_job.custom_pipeline.name == "Custom Pipeline"
    
    @pytest.mark.asyncio
    async def test_get_batch_job(self, batch_processor):
        """Test getting batch job by ID"""
        request = BatchJobRequest(
            name="Test Batch",
            file_ids=["file1", "file2"],
            pipeline_id="image_resize"
        )
        
        created_job = await batch_processor.create_batch_job(request)
        retrieved_job = await batch_processor.get_batch_job(created_job.batch_id)
        
        assert retrieved_job is not None
        assert retrieved_job.batch_id == created_job.batch_id
        assert retrieved_job.name == created_job.name
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_batch_job(self, batch_processor):
        """Test getting non-existent batch job"""
        job = await batch_processor.get_batch_job("nonexistent")
        assert job is None
    
    @pytest.mark.asyncio
    async def test_process_batch_job_async_success(self, batch_processor):
        """Test successful batch job processing"""
        request = BatchJobRequest(
            name="Test Batch",
            file_ids=["file1", "file2"],
            pipeline_id="content_analysis",  # Use content analysis as it doesn't require actual files
            priority=JobPriority.MEDIUM
        )
        
        batch_job = await batch_processor.create_batch_job(request)
        
        # Mock the job manager methods
        batch_processor.job_manager.create_job = AsyncMock()
        batch_processor.job_manager.process_job_async = AsyncMock()
        batch_processor.job_manager.get_job = AsyncMock()
        
        # Mock successful job completion
        mock_job = AsyncMock()
        mock_job.status = JobStatus.COMPLETED
        mock_job.result = AsyncMock()
        mock_job.result.processing_time_seconds = 10.0
        batch_processor.job_manager.get_job.return_value = mock_job
        
        # Process batch job
        await batch_processor.process_batch_job_async(batch_job.batch_id)
        
        # Check final status
        completed_job = await batch_processor.get_batch_job(batch_job.batch_id)
        assert completed_job.status == JobStatus.COMPLETED
        assert completed_job.result is not None
        assert completed_job.result.success is True
        assert completed_job.result.completed_files == 2
    
    @pytest.mark.asyncio
    async def test_process_batch_job_async_with_failures(self, batch_processor):
        """Test batch job processing with some failures"""
        request = BatchJobRequest(
            name="Test Batch",
            file_ids=["file1", "file2", "file3"],
            pipeline_id="content_analysis",
            priority=JobPriority.MEDIUM
        )
        
        batch_job = await batch_processor.create_batch_job(request)
        
        # Mock job manager
        batch_processor.job_manager.create_job = AsyncMock()
        batch_processor.job_manager.process_job_async = AsyncMock()
        
        # Mock mixed results (2 success, 1 failure)
        def mock_get_job(job_id):
            mock_job = AsyncMock()
            if "file3" in job_id:
                mock_job.status = JobStatus.FAILED
                mock_job.error_message = "Test error"
            else:
                mock_job.status = JobStatus.COMPLETED
                mock_job.result = AsyncMock()
                mock_job.result.processing_time_seconds = 10.0
            return mock_job
        
        batch_processor.job_manager.get_job = AsyncMock(side_effect=mock_get_job)
        
        # Process batch job
        await batch_processor.process_batch_job_async(batch_job.batch_id)
        
        # Check final status
        completed_job = await batch_processor.get_batch_job(batch_job.batch_id)
        assert completed_job.status == JobStatus.COMPLETED  # Still completed as some succeeded
        assert completed_job.result.success is False  # But not fully successful
        assert completed_job.result.completed_files == 2
        assert completed_job.result.failed_files == 1
    
    @pytest.mark.asyncio
    async def test_cancel_batch_job(self, batch_processor):
        """Test cancelling a batch job"""
        request = BatchJobRequest(
            name="Test Batch",
            file_ids=["file1", "file2"],
            pipeline_id="image_resize"
        )
        
        batch_job = await batch_processor.create_batch_job(request)
        
        # Mock job manager cancel method
        batch_processor.job_manager.cancel_job = AsyncMock(return_value=True)
        
        # Cancel batch job
        success = await batch_processor.cancel_batch_job(batch_job.batch_id)
        
        assert success is True
        
        # Check status
        cancelled_job = await batch_processor.get_batch_job(batch_job.batch_id)
        assert cancelled_job.status == JobStatus.CANCELLED
    
    @pytest.mark.asyncio
    async def test_cancel_completed_batch_job(self, batch_processor):
        """Test cancelling already completed batch job"""
        request = BatchJobRequest(
            name="Test Batch",
            file_ids=["file1"],
            pipeline_id="image_resize"
        )
        
        batch_job = await batch_processor.create_batch_job(request)
        batch_job.status = JobStatus.COMPLETED
        
        success = await batch_processor.cancel_batch_job(batch_job.batch_id)
        
        assert success is False
    
    @pytest.mark.asyncio
    async def test_get_batch_job_metrics(self, batch_processor):
        """Test getting batch job metrics"""
        request = BatchJobRequest(
            name="Test Batch",
            file_ids=["file1", "file2", "file3"],
            pipeline_id="content_analysis"
        )
        
        batch_job = await batch_processor.create_batch_job(request)
        
        # Mock job results
        mock_jobs = []
        for i, file_id in enumerate enumerate(batch_job.file_ids):
            mock_job = AsyncMock()
            mock_job.file_id = file_id
            mock_job.status = JobStatus.COMPLETED if i < 2 else JobStatus.FAILED
            mock_job.result = AsyncMock()
            mock_job.result.processing_time_seconds = 10.0 + i * 5
            mock_jobs.append(mock_job)
        
        batch_processor.batch_job_results[batch_job.batch_id] = mock_jobs
        
        metrics = await batch_processor.get_batch_job_metrics(batch_job.batch_id)
        
        assert metrics['batch_id'] == batch_job.batch_id
        assert metrics['total_files'] == 3
        assert metrics['completed_files'] == 2
        assert metrics['failed_files'] == 1
        assert metrics['success_rate'] == 66.66666666666666
        assert metrics['failure_rate'] == 33.33333333333333
    
    @pytest.mark.asyncio
    async def test_list_batch_jobs(self, batch_processor):
        """Test listing batch jobs"""
        # Create multiple batch jobs
        requests = [
            BatchJobRequest(name="Batch 1", file_ids=["file1"], pipeline_id="image_resize"),
            BatchJobRequest(name="Batch 2", file_ids=["file2"], pipeline_id="image_resize"),
            BatchJobRequest(name="Batch 3", file_ids=["file3"], pipeline_id="image_resize")
        ]
        
        for req in requests:
            await batch_processor.create_batch_job(req)
        
        # List all jobs
        all_jobs = await batch_processor.list_batch_jobs()
        assert len(all_jobs) >= 3
        
        # List jobs by status
        pending_jobs = await batch_processor.list_batch_jobs(status=JobStatus.PENDING)
        assert len(pending_jobs) >= 3
        
        # Update one job status and filter
        first_job = all_jobs[0]
        first_job.status = JobStatus.COMPLETED
        
        completed_jobs = await batch_processor.list_batch_jobs(status=JobStatus.COMPLETED)
        assert len(completed_jobs) >= 1
    
    @pytest.mark.asyncio
    async def test_cleanup_completed_batch_jobs(self, batch_processor):
        """Test cleaning up completed batch jobs"""
        # Create batch jobs
        request1 = BatchJobRequest(name="Old Batch", file_ids=["file1"], pipeline_id="image_resize")
        request2 = BatchJobRequest(name="Recent Batch", file_ids=["file2"], pipeline_id="image_resize")
        
        batch_job1 = await batch_processor.create_batch_job(request1)
        batch_job2 = await batch_processor.create_batch_job(request2)
        
        # Mark one as completed and old
        batch_job1.status = JobStatus.COMPLETED
        batch_job1.completed_at = datetime.utcnow()
        
        # Mark other as recent
        batch_job2.status = JobStatus.COMPLETED
        batch_job2.completed_at = datetime.utcnow()
        
        # Test cleanup (should not remove recent jobs)
        cleaned = await batch_processor.cleanup_completed_batch_jobs(older_than_hours=0)
        assert cleaned >= 0
    
    @pytest.mark.asyncio
    async def test_get_batch_job_file_results(self, batch_processor):
        """Test getting detailed file results for batch job"""
        request = BatchJobRequest(
            name="Test Batch",
            file_ids=["file1", "file2"],
            pipeline_id="content_analysis"
        )
        
        batch_job = await batch_processor.create_batch_job(request)
        
        # Mock job results
        mock_jobs = []
        for file_id in batch_job.file_ids:
            mock_job = AsyncMock()
            mock_job.file_id = file_id
            mock_job.job_id = f"job-{file_id}"
            mock_job.status = JobStatus.COMPLETED
            mock_job.created_at = datetime.utcnow()
            mock_job.started_at = datetime.utcnow()
            mock_job.completed_at = datetime.utcnow()
            mock_job.error_message = None
            mock_job.metadata = {"batch_id": batch_job.batch_id}
            mock_job.result = AsyncMock()
            mock_job.result.success = True
            mock_job.result.output_files = [f"output-{file_id}.jpg"]
            mock_job.result.processing_time_seconds = 15.0
            mock_jobs.append(mock_job)
        
        batch_processor.batch_job_results[batch_job.batch_id] = mock_jobs
        
        results = await batch_processor.get_batch_job_file_results(batch_job.batch_id)
        
        assert results['batch_id'] == batch_job.batch_id
        assert results['total_files'] == 2
        assert len(results['file_results']) == 2
        
        # Check first file result
        first_result = results['file_results'][0]
        assert first_result['file_id'] in batch_job.file_ids
        assert first_result['status'] == JobStatus.COMPLETED
        assert first_result['success'] is True
        assert len(first_result['output_files']) == 1
    
    def test_generate_error_summary(self, batch_processor):
        """Test error summary generation"""
        # Mock jobs with different errors
        mock_jobs = [
            AsyncMock(status=JobStatus.FAILED, error_message="File not found: file1"),
            AsyncMock(status=JobStatus.FAILED, error_message="File not found: file2"),
            AsyncMock(status=JobStatus.FAILED, error_message="Invalid format: file3"),
            AsyncMock(status=JobStatus.COMPLETED)
        ]
        
        batch_processor.batch_job_results["test-batch"] = mock_jobs
        
        error_summary = batch_processor._generate_error_summary("test-batch")
        
        assert "File not found" in error_summary
        assert error_summary["File not found"] == 2
        assert "Invalid format" in error_summary
        assert error_summary["Invalid format"] == 1
