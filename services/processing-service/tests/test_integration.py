import pytest
import asyncio
import json
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime
import tempfile
import httpx

from services.processing_service.main import app
from services.processing_service.services.processing_service import ProcessingService
from services.processing_service.services.job_manager import JobManager
from services.processing_service.services.batch_processor import BatchProcessor
from services.processing_service.database.datastore import DatastoreClient
from services.processing_service.models import (
    JobRequest, JobStatus, JobPriority, BatchJobRequest, ProcessingPipeline,
    PipelineStep, ProcessingType
)

class TestIntegration:
    """Integration tests for the processing service"""
    
    @pytest.fixture
    async def test_client(self):
        """Create test client for FastAPI app"""
        from httpx import AsyncClient
        async with AsyncClient(app=app, base_url="http://test") as client:
            yield client
    
    @pytest.fixture
    def mock_storage_client(self):
        """Mock Google Cloud Storage client"""
        storage_mock = Mock()
        bucket_mock = Mock()
        blob_mock = Mock()
        
        storage_mock.bucket.return_value = bucket_mock
        bucket_mock.blob.return_value = blob_mock
        blob_mock.download_to_filename = Mock()
        blob_mock.upload_from_filename = Mock()
        blob_mock.exists.return_value = True
        
        return storage_mock
    
    @pytest.fixture
    def mock_datastore_client(self):
        """Mock Datastore client"""
        client = Mock(spec=DatastoreClient)
        client.save_job = AsyncMock(return_value=True)
        client.get_job = AsyncMock(return_value=None)
        client.query_jobs = AsyncMock(return_value=[])
        client.delete_job = AsyncMock(return_value=True)
        client.save_dead_letter_entry = AsyncMock(return_value=True)
        client.get_dead_letter_entry = AsyncMock(return_value=None)
        client.query_dead_letter_entries = AsyncMock(return_value=[])
        client.delete_dead_letter_entry = AsyncMock(return_value=True)
        client.close = AsyncMock()
        return client
    
    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client"""
        redis_mock = Mock()
        redis_mock.ping.return_value = True
        redis_mock.get.return_value = None
        redis_mock.set.return_value = True
        redis_mock.delete.return_value = True
        return redis_mock
    
    @pytest.fixture
    async def setup_services(self, mock_datastore_client, mock_redis, mock_storage_client, temp_dir):
        """Setup all services for integration testing"""
        # Mock the dependencies in main.py
        with patch('services.processing_service.main.DatastoreClient', return_value=mock_datastore_client), \
             patch('redis.Redis', return_value=mock_redis), \
             patch('google.cloud.storage.Client', return_value=mock_storage_client):
            
            # Initialize services
            from services.processing_service.config import Settings
            settings = Settings(
                environment="testing",
                google_cloud_project="test-project",
                temp_dir=str(temp_dir),
                redis_url="redis://localhost:6379/1"
            )
            
            processing_service = ProcessingService(settings)
            job_manager = JobManager(mock_datastore_client, settings.redis_url)
            batch_processor = BatchProcessor(job_manager, processing_service)
            
            await job_manager.initialize(processing_service)
            
            yield {
                'processing_service': processing_service,
                'job_manager': job_manager,
                'batch_processor': batch_processor,
                'settings': settings
            }
    
    @pytest.mark.asyncio
    async def test_create_and_process_job_integration(self, test_client, setup_services, sample_image_file):
        """Test complete job creation and processing workflow"""
        services = setup_services
        
        # Mock file download from storage
        with patch.object(services['processing_service'], '_get_file_path', return_value=str(sample_image_file)):
            # Create job request
            job_request = {
                "file_id": "test-file-123",
                "pipeline_id": "image_resize",
                "priority": "medium"
            }
            
            # Create job
            response = await test_client.post("/api/v1/jobs", json=job_request)
            assert response.status_code == 200
            
            job_data = response.json()
            assert job_data['file_id'] == "test-file-123"
            assert job_data['status'] == JobStatus.PENDING
            
            job_id = job_data['job_id']
            
            # Wait for processing to complete (with timeout)
            max_wait_time = 30  # seconds
            wait_interval = 1  # second
            
            for _ in range(max_wait_time // wait_interval):
                response = await test_client.get(f"/api/v1/jobs/{job_id}")
                assert response.status_code == 200
                
                job_status = response.json()['status']
                if job_status in [JobStatus.COMPLETED, JobStatus.FAILED]:
                    break
                
                await asyncio.sleep(wait_interval)
            
            # Check final status
            response = await test_client.get(f"/api/v1/jobs/{job_id}")
            assert response.status_code == 200
            
            final_job = response.json()
            assert final_job['status'] == JobStatus.COMPLETED
            assert final_job['result'] is not None
            assert final_job['result']['success'] is True
    
    @pytest.mark.asyncio
    async def test_batch_job_integration(self, test_client, setup_services, sample_image_file):
        """Test batch job creation and processing"""
        services = setup_services
        
        # Mock file download from storage
        with patch.object(services['processing_service'], '_get_file_path', return_value=str(sample_image_file)):
            # Create batch job request
            batch_request = {
                "name": "Test Batch Job",
                "file_ids": ["file1", "file2", "file3"],
                "pipeline_id": "content_analysis",
                "priority": "medium"
            }
            
            # Create batch job
            response = await test_client.post("/api/v1/batch-jobs", json=batch_request)
            assert response.status_code == 200
            
            batch_data = response.json()
            assert batch_data['name'] == "Test Batch Job"
            assert batch_data['file_ids'] == ["file1", "file2", "file3"]
            assert batch_data['status'] == JobStatus.PENDING
            
            batch_id = batch_data['batch_id']
            
            # Wait for batch processing to complete
            max_wait_time = 60  # seconds
            wait_interval = 2  # seconds
            
            for _ in range(max_wait_time // wait_interval):
                response = await test_client.get(f"/api/v1/batch-jobs/{batch_id}")
                assert response.status_code == 200
                
                batch_status = response.json()['status']
                if batch_status in [JobStatus.COMPLETED, JobStatus.FAILED]:
                    break
                
                await asyncio.sleep(wait_interval)
            
            # Check final status
            response = await test_client.get(f"/api/v1/batch-jobs/{batch_id}")
            assert response.status_code == 200
            
            final_batch = response.json()
            assert final_batch['status'] == JobStatus.COMPLETED
            assert final_batch['result'] is not None
            assert final_batch['result']['total_files'] == 3
    
    @pytest.mark.asyncio
    async def test_pipeline_management_integration(self, test_client):
        """Test pipeline management endpoints"""
        # List pipelines
        response = await test_client.get("/api/v1/pipelines")
        assert response.status_code == 200
        
        pipelines = response.json()
        assert len(pipelines) > 0
        
        # Check for built-in pipelines
        pipeline_ids = [p['pipeline_id'] for p in pipelines]
        assert "image_resize" in pipeline_ids
        assert "content_analysis" in pipeline_ids
        
        # Get specific pipeline
        response = await test_client.get("/api/v1/pipelines/image_resize")
        assert response.status_code == 200
        
        pipeline = response.json()
        assert pipeline['pipeline_id'] == "image_resize"
        assert pipeline['name'] == "Image Resize"
        assert len(pipeline['steps']) == 1
    
    @pytest.mark.asyncio
    async def test_custom_pipeline_creation_integration(self, test_client):
        """Test custom pipeline creation"""
        custom_pipeline = {
            "name": "Custom Test Pipeline",
            "description": "A test pipeline for integration testing",
            "steps": [
                {
                    "name": "resize_step",
                    "processing_type": "image_resize",
                    "parameters": {"width": 200, "height": 200}
                },
                {
                    "name": "convert_step",
                    "processing_type": "image_format_convert",
                    "parameters": {"target_format": "png"},
                    "depends_on": ["resize_step"]
                }
            ],
            "input_formats": [".jpg", ".jpeg"],
            "output_formats": [".png"],
            "is_custom": True
        }
        
        # Create custom pipeline
        response = await test_client.post("/api/v1/pipelines", json=custom_pipeline)
        assert response.status_code == 200
        
        created_pipeline = response.json()
        assert created_pipeline['name'] == "Custom Test Pipeline"
        assert len(created_pipeline['steps']) == 2
        assert created_pipeline['is_custom'] is True
    
    @pytest.mark.asyncio
    async def test_error_handling_integration(self, test_client, setup_services):
        """Test error handling in processing workflow"""
        services = setup_services
        
        # Mock file not found
        with patch.object(services['processing_service'], '_get_file_path', return_value=None):
            job_request = {
                "file_id": "nonexistent-file",
                "pipeline_id": "image_resize",
                "priority": "medium"
            }
            
            # Create job
            response = await test_client.post("/api/v1/jobs", json=job_request)
            assert response.status_code == 200
            
            job_id = response.json()['job_id']
            
            # Wait for processing to fail
            max_wait_time = 30
            wait_interval = 1
            
            for _ in range(max_wait_time // wait_interval):
                response = await test_client.get(f"/api/v1/jobs/{job_id}")
                job_status = response.json()['status']
                
                if job_status == JobStatus.FAILED:
                    break
                
                await asyncio.sleep(wait_interval)
            
            # Check that job failed
            response = await test_client.get(f"/api/v1/jobs/{job_id}")
            assert response.status_code == 200
            
            failed_job = response.json()
            assert failed_job['status'] == JobStatus.FAILED
            assert failed_job['error_message'] is not None
    
    @pytest.mark.asyncio
    async def test_job_cancellation_integration(self, test_client, setup_services):
        """Test job cancellation"""
        services = setup_services
        
        # Create a job that takes time to process
        with patch.object(services['processing_service'], '_get_file_path', return_value="/tmp/test"):
            job_request = {
                "file_id": "slow-file",
                "pipeline_id": "content_analysis",  # This might take time
                "priority": "low"
            }
            
            # Create job
            response = await test_client.post("/api/v1/jobs", json=job_request)
            assert response.status_code == 200
            
            job_id = response.json()['job_id']
            
            # Cancel the job
            response = await test_client.delete(f"/api/v1/jobs/{job_id}")
            assert response.status_code == 200
            
            # Check that job was cancelled
            response = await test_client.get(f"/api/v1/jobs/{job_id}")
            assert response.status_code == 200
            
            cancelled_job = response.json()
            assert cancelled_job['status'] == JobStatus.CANCELLED
    
    @pytest.mark.asyncio
    async def test_concurrent_job_processing(self, test_client, setup_services, sample_image_file):
        """Test concurrent job processing"""
        services = setup_services
        
        with patch.object(services['processing_service'], '_get_file_path', return_value=str(sample_image_file)):
            # Create multiple jobs concurrently
            job_requests = [
                {
                    "file_id": f"file-{i}",
                    "pipeline_id": "image_resize",
                    "priority": "medium"
                }
                for i in range(5)
            ]
            
            # Submit all jobs
            job_ids = []
            for request in job_requests:
                response = await test_client.post("/api/v1/jobs", json=request)
                assert response.status_code == 200
                job_ids.append(response.json()['job_id'])
            
            # Wait for all jobs to complete
            max_wait_time = 60
            wait_interval = 2
            
            all_completed = False
            for _ in range(max_wait_time // wait_interval):
                completed_count = 0
                
                for job_id in job_ids:
                    response = await test_client.get(f"/api/v1/jobs/{job_id}")
                    job_status = response.json()['status']
                    
                    if job_status in [JobStatus.COMPLETED, JobStatus.FAILED]:
                        completed_count += 1
                
                if completed_count == len(job_ids):
                    all_completed = True
                    break
                
                await asyncio.sleep(wait_interval)
            
            assert all_completed, "Not all jobs completed in time"
    
    @pytest.mark.asyncio
    async def test_health_check_integration(self, test_client):
        """Test health check endpoint"""
        response = await test_client.get("/health")
        assert response.status_code == 200
        
        health_data = response.json()
        assert health_data['status'] == 'healthy'
        assert health_data['service'] == 'processing-service'
    
    @pytest.mark.asyncio
    async def test_service_metrics_integration(self, test_client, setup_services):
        """Test service metrics endpoints"""
        services = setup_services
        
        # Create some jobs to generate metrics
        with patch.object(services['processing_service'], '_get_file_path', return_value="/tmp/test"):
            for i in range(3):
                job_request = {
                    "file_id": f"metrics-file-{i}",
                    "pipeline_id": "content_analysis",
                    "priority": "medium"
                }
                
                response = await test_client.post("/api/v1/jobs", json=job_request)
                assert response.status_code == 200
        
        # List jobs to check metrics
        response = await test_client.get("/api/v1/jobs")
        assert response.status_code == 200
        
        jobs = response.json()
        assert len(jobs) >= 3
    
    @pytest.mark.asyncio
    async def test_file_storage_integration(self, test_client, setup_services, temp_dir):
        """Test integration with file storage service"""
        services = setup_services
        
        # Create a test file
        test_file = temp_dir / "test_image.jpg"
        from PIL import Image
        img = Image.new('RGB', (100, 100), color='blue')
        img.save(test_file)
        
        # Mock storage operations
        with patch.object(services['processing_service'], '_get_file_path', return_value=str(test_file)):
            job_request = {
                "file_id": "storage-test-file",
                "pipeline_id": "image_resize",
                "priority": "medium"
            }
            
            # Create and process job
            response = await test_client.post("/api/v1/jobs", json=job_request)
            assert response.status_code == 200
            
            job_id = response.json()['job_id']
            
            # Wait for completion
            max_wait_time = 30
            wait_interval = 1
            
            for _ in range(max_wait_time // wait_interval):
                response = await test_client.get(f"/api/v1/jobs/{job_id}")
                job_status = response.json()['status']
                
                if job_status == JobStatus.COMPLETED:
                    break
                
                await asyncio.sleep(wait_interval)
            
            # Verify job completed successfully
            response = await test_client.get(f"/api/v1/jobs/{job_id}")
            assert response.status_code == 200
            
            completed_job = response.json()
            assert completed_job['status'] == JobStatus.COMPLETED
            assert completed_job['result']['success'] is True
            assert len(completed_job['result']['output_files']) > 0
    
    @pytest.mark.asyncio
    async def test_pipeline_dependency_integration(self, test_client, setup_services, sample_image_file):
        """Test pipeline with step dependencies"""
        services = setup_services
        
        # Create custom pipeline with dependencies
        custom_pipeline = {
            "name": "Dependency Test Pipeline",
            "description": "Test pipeline with step dependencies",
            "steps": [
                {
                    "name": "first_step",
                    "processing_type": "image_resize",
                    "parameters": {"width": 200, "height": 200}
                },
                {
                    "name": "second_step",
                    "processing_type": "image_format_convert",
                    "parameters": {"target_format": "png"},
                    "depends_on": ["first_step"]
                }
            ],
            "input_formats": [".jpg"],
            "output_formats": [".png"],
            "is_custom": True
        }
        
        # Create pipeline
        response = await test_client.post("/api/v1/pipelines", json=custom_pipeline)
        assert response.status_code == 200
        
        pipeline_id = response.json()['pipeline_id']
        
        # Use the custom pipeline
        with patch.object(services['processing_service'], '_get_file_path', return_value=str(sample_image_file)):
            job_request = {
                "file_id": "dependency-test-file",
                "custom_pipeline": custom_pipeline,
                "priority": "medium"
            }
            
            # Create and process job
            response = await test_client.post("/api/v1/jobs", json=job_request)
            assert response.status_code == 200
            
            job_id = response.json()['job_id']
            
            # Wait for completion
            max_wait_time = 45
            wait_interval = 1
            
            for _ in range(max_wait_time // wait_interval):
                response = await test_client.get(f"/api/v1/jobs/{job_id}")
                job_status = response.json()['status']
                
                if job_status == JobStatus.COMPLETED:
                    break
                
                await asyncio.sleep(wait_interval)
            
            # Verify job completed successfully
            response = await test_client.get(f"/api/v1/jobs/{job_id}")
            assert response.status_code == 200
            
            completed_job = response.json()
            assert completed_job['status'] == JobStatus.COMPLETED
            assert completed_job['result']['success'] is True
