import pytest
import asyncio
import time
import statistics
from pathlib import Path
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor
import threading
from unittest.mock import Mock, AsyncMock, patch

from services.processing_service.services.batch_processor import BatchProcessor
from services.processing_service.services.job_manager import JobManager
from services.processing_service.services.processing_service import ProcessingService
from services.processing_service.models import (
    BatchJobRequest, JobStatus, JobPriority, ProcessingPipeline,
    PipelineStep, ProcessingType
)

class TestLoadScenarios:
    """Load tests for batch processing scenarios"""
    
    @pytest.fixture
    def load_test_config(self):
        """Configuration for load tests"""
        return {
            'small_batch_size': 10,
            'medium_batch_size': 50,
            'large_batch_size': 100,
            'concurrent_batches': 5,
            'test_duration_seconds': 60,
            'max_wait_time_seconds': 120
        }
    
    @pytest.fixture
    def mock_services(self, temp_dir):
        """Create mock services for load testing"""
        # Mock processing service
        processing_service = Mock(spec=ProcessingService)
        processing_service.process_file = AsyncMock(return_value={
            'success': True,
            'processed_files': [f'/tmp/output_{i}.jpg'],
            'metadata': {'processing_time': 1.0}
        })
        
        # Mock job manager
        job_manager = Mock(spec=JobManager)
        job_manager.create_job = AsyncMock()
        job_manager.process_job_async = AsyncMock()
        job_manager.get_job = AsyncMock()
        
        # Mock job responses
        def mock_get_job(job_id):
            mock_job = Mock()
            mock_job.job_id = job_id
            mock_job.status = JobStatus.COMPLETED
            mock_job.result = Mock()
            mock_job.result.success = True
            mock_job.result.processing_time_seconds = 1.0
            return mock_job
        
        job_manager.get_job.side_effect = mock_get_job
        
        # Create batch processor
        batch_processor = BatchProcessor(job_manager, processing_service)
        
        return {
            'processing_service': processing_service,
            'job_manager': job_manager,
            'batch_processor': batch_processor
        }
    
    @pytest.mark.asyncio
    async def test_small_batch_load(self, mock_services, load_test_config):
        """Test load with small batch sizes"""
        batch_processor = mock_services['batch_processor']
        batch_size = load_test_config['small_batch_size']
        
        # Create batch job request
        file_ids = [f"file_{i}" for i in range(batch_size)]
        batch_request = BatchJobRequest(
            name="Small Load Test Batch",
            file_ids=file_ids,
            pipeline_id="image_resize",
            priority=JobPriority.MEDIUM
        )
        
        # Measure performance
        start_time = time.time()
        
        batch_job = await batch_processor.create_batch_job(batch_request)
        
        # Process batch job
        await batch_processor.process_batch_job_async(batch_job.batch_id)
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        # Verify results
        completed_batch = await batch_processor.get_batch_job(batch_job.batch_id)
        assert completed_batch.status == JobStatus.COMPLETED
        assert completed_batch.result.total_files == batch_size
        assert completed_batch.result.successful_jobs == file_ids
        
        # Performance assertions
        assert processing_time < load_test_config['max_wait_time_seconds']
        assert processing_time > 0
        
        # Calculate throughput
        throughput = batch_size / processing_time
        assert throughput > 0
        
        print(f"Small batch ({batch_size} files): {processing_time:.2f}s, {throughput:.2f} files/sec")
    
    @pytest.mark.asyncio
    async def test_medium_batch_load(self, mock_services, load_test_config):
        """Test load with medium batch sizes"""
        batch_processor = mock_services['batch_processor']
        batch_size = load_test_config['medium_batch_size']
        
        # Create batch job request
        file_ids = [f"file_{i}" for i in range(batch_size)]
        batch_request = BatchJobRequest(
            name="Medium Load Test Batch",
            file_ids=file_ids,
            pipeline_id="content_analysis",
            priority=JobPriority.MEDIUM,
            chunk_size=20  # Process in chunks of 20
        )
        
        # Measure performance
        start_time = time.time()
        
        batch_job = await batch_processor.create_batch_job(batch_request)
        await batch_processor.process_batch_job_async(batch_job.batch_id)
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        # Verify results
        completed_batch = await batch_processor.get_batch_job(batch_job.batch_id)
        assert completed_batch.status == JobStatus.COMPLETED
        assert completed_batch.result.total_files == batch_size
        
        # Performance assertions
        assert processing_time < load_test_config['max_wait_time_seconds']
        
        # Calculate throughput
        throughput = batch_size / processing_time
        print(f"Medium batch ({batch_size} files): {processing_time:.2f}s, {throughput:.2f} files/sec")
    
    @pytest.mark.asyncio
    async def test_large_batch_load(self, mock_services, load_test_config):
        """Test load with large batch sizes"""
        batch_processor = mock_services['batch_processor']
        batch_size = load_test_config['large_batch_size']
        
        # Create batch job request
        file_ids = [f"file_{i}" for i in range(batch_size)]
        batch_request = BatchJobRequest(
            name="Large Load Test Batch",
            file_ids=file_ids,
            pipeline_id="image_optimize",
            priority=JobPriority.LOW,
            chunk_size=50  # Process in chunks of 50
        )
        
        # Measure performance
        start_time = time.time()
        
        batch_job = await batch_processor.create_batch_job(batch_request)
        await batch_processor.process_batch_job_async(batch_job.batch_id)
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        # Verify results
        completed_batch = await batch_processor.get_batch_job(batch_job.batch_id)
        assert completed_batch.status == JobStatus.COMPLETED
        assert completed_batch.result.total_files == batch_size
        
        # Performance assertions
        assert processing_time < load_test_config['max_wait_time_seconds']
        
        # Calculate throughput
        throughput = batch_size / processing_time
        print(f"Large batch ({batch_size} files): {processing_time:.2f}s, {throughput:.2f} files/sec")
    
    @pytest.mark.asyncio
    async def test_concurrent_batch_load(self, mock_services, load_test_config):
        """Test concurrent batch processing"""
        batch_processor = mock_services['batch_processor']
        concurrent_batches = load_test_config['concurrent_batches']
        batch_size = load_test_config['small_batch_size']
        
        # Create multiple batch jobs
        batch_requests = []
        batch_jobs = []
        
        for i in range(concurrent_batches):
            file_ids = [f"concurrent_file_{i}_{j}" for j in range(batch_size)]
            batch_request = BatchJobRequest(
                name=f"Concurrent Batch {i}",
                file_ids=file_ids,
                pipeline_id="image_resize",
                priority=JobPriority.MEDIUM
            )
            batch_requests.append(batch_request)
        
        # Measure performance
        start_time = time.time()
        
        # Create and start all batches concurrently
        tasks = []
        for batch_request in batch_requests:
            batch_job = await batch_processor.create_batch_job(batch_request)
            batch_jobs.append(batch_job)
            
            task = asyncio.create_task(
                batch_processor.process_batch_job_async(batch_job.batch_id)
            )
            tasks.append(task)
        
        # Wait for all batches to complete
        await asyncio.gather(*tasks)
        
        end_time = time.time()
        total_processing_time = end_time - start_time
        
        # Verify all batches completed
        total_files = 0
        for batch_job in batch_jobs:
            completed_batch = await batch_processor.get_batch_job(batch_job.batch_id)
            assert completed_batch.status == JobStatus.COMPLETED
            total_files += completed_batch.result.total_files
        
        # Performance assertions
        assert total_processing_time < load_test_config['max_wait_time_seconds']
        
        # Calculate throughput
        total_throughput = total_files / total_processing_time
        print(f"Concurrent batches ({concurrent_batches}x{batch_size}): {total_processing_time:.2f}s, {total_throughput:.2f} files/sec")
    
    @pytest.mark.asyncio
    async def test_mixed_priority_load(self, mock_services, load_test_config):
        """Test load with mixed priority jobs"""
        batch_processor = mock_services['batch_processor']
        
        # Create batches with different priorities
        priorities = [JobPriority.URGENT, JobPriority.HIGH, JobPriority.MEDIUM, JobPriority.LOW]
        batch_size = load_test_config['small_batch_size']
        
        batch_jobs = []
        tasks = []
        
        start_time = time.time()
        
        # Create batches with different priorities
        for i, priority in enumerate(priorities):
            file_ids = [f"priority_{priority.value}_{j}" for j in range(batch_size)]
            batch_request = BatchJobRequest(
                name=f"Priority {priority.value} Batch",
                file_ids=file_ids,
                pipeline_id="content_analysis",
                priority=priority
            )
            
            batch_job = await batch_processor.create_batch_job(batch_request)
            batch_jobs.append(batch_job)
            
            task = asyncio.create_task(
                batch_processor.process_batch_job_async(batch_job.batch_id)
            )
            tasks.append(task)
        
        # Wait for all batches to complete
        await asyncio.gather(*tasks)
        
        end_time = time.time()
        total_processing_time = end_time - start_time
        
        # Verify all batches completed
        for batch_job in batch_jobs:
            completed_batch = await batch_processor.get_batch_job(batch_job.batch_id)
            assert completed_batch.status == JobStatus.COMPLETED
        
        total_files = len(priorities) * batch_size
        throughput = total_files / total_processing_time
        
        print(f"Mixed priority load: {total_processing_time:.2f}s, {throughput:.2f} files/sec")
    
    @pytest.mark.asyncio
    async def test_sustained_load(self, mock_services, load_test_config):
        """Test sustained load over time"""
        batch_processor = mock_services['batch_processor']
        test_duration = load_test_config['test_duration_seconds']
        batch_size = load_test_config['small_batch_size']
        
        start_time = time.time()
        batch_count = 0
        total_files_processed = 0
        processing_times = []
        
        while (time.time() - start_time) < test_duration:
            batch_start = time.time()
            
            # Create batch
            file_ids = [f"sustained_{batch_count}_{i}" for i in range(batch_size)]
            batch_request = BatchJobRequest(
                name=f"Sustained Batch {batch_count}",
                file_ids=file_ids,
                pipeline_id="image_resize",
                priority=JobPriority.MEDIUM
            )
            
            batch_job = await batch_processor.create_batch_job(batch_request)
            await batch_processor.process_batch_job_async(batch_job.batch_id)
            
            batch_end = time.time()
            batch_processing_time = batch_end - batch_start
            processing_times.append(batch_processing_time)
            
            total_files_processed += batch_size
            batch_count += 1
        
        total_test_time = time.time() - start_time
        
        # Calculate statistics
        avg_processing_time = statistics.mean(processing_times)
        min_processing_time = min(processing_times)
        max_processing_time = max(processing_times)
        std_dev_processing_time = statistics.stdev(processing_times) if len(processing_times) > 1 else 0
        
        overall_throughput = total_files_processed / total_test_time
        
        print(f"Sustained load ({test_duration}s):")
        print(f"  Batches processed: {batch_count}")
        print(f"  Total files: {total_files_processed}")
        print(f"  Overall throughput: {overall_throughput:.2f} files/sec")
        print(f"  Avg batch time: {avg_processing_time:.2f}s")
        print(f"  Min batch time: {min_processing_time:.2f}s")
        print(f"  Max batch time: {max_processing_time:.2f}s")
        print(f"  Std deviation: {std_dev_processing_time:.2f}s")
        
        # Performance assertions
        assert overall_throughput > 0
        assert avg_processing_time < load_test_config['max_wait_time_seconds']
    
    @pytest.mark.asyncio
    async def test_error_handling_load(self, mock_services, load_test_config):
        """Test error handling under load"""
        batch_processor = mock_services['batch_processor']
        batch_size = load_test_config['small_batch_size']
        
        # Mock processing service to simulate failures
        failure_rate = 0.2  # 20% failure rate
        
        async def mock_process_with_failures(file_path, pipeline, job, progress_callback=None):
            import random
            if random.random() < failure_rate:
                return {
                    'success': False,
                    'error': 'Simulated processing failure'
                }
            else:
                return {
                    'success': True,
                    'processed_files': [f'/tmp/output_{file_path}'],
                    'metadata': {'processing_time': 1.0}
                }
        
        mock_services['processing_service'].process_file = mock_process_with_failures
        
        # Create batch job
        file_ids = [f"error_test_{i}" for i in range(batch_size)]
        batch_request = BatchJobRequest(
            name="Error Handling Load Test",
            file_ids=file_ids,
            pipeline_id="image_resize",
            priority=JobPriority.MEDIUM
        )
        
        start_time = time.time()
        
        batch_job = await batch_processor.create_batch_job(batch_request)
        await batch_processor.process_batch_job_async(batch_job.batch_id)
        
        end_time = time.time()
        processing_time = end_time - start_time
        
        # Verify results
        completed_batch = await batch_processor.get_batch_job(batch_job.batch_id)
        assert completed_batch.status == JobStatus.COMPLETED  # Batch completes even with some failures
        assert completed_batch.result.total_files == batch_size
        assert completed_batch.result.failed_files > 0  # Some files should have failed
        assert completed_batch.result.successful_jobs > 0  # Some files should have succeeded
        
        # Check that failure rate is approximately what we expect
        actual_failure_rate = completed_batch.result.failed_files / batch_size
        assert abs(actual_failure_rate - failure_rate) < 0.3  # Allow 30% tolerance
        
        print(f"Error handling load: {processing_time:.2f}s, failure rate: {actual_failure_rate:.2%}")
    
    @pytest.mark.asyncio
    async def test_memory_usage_load(self, mock_services, load_test_config):
        """Test memory usage under load"""
        import psutil
        import os
        
        batch_processor = mock_services['batch_processor']
        batch_size = load_test_config['medium_batch_size']
        
        # Get initial memory usage
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Create multiple batches to test memory growth
        num_batches = 5
        memory_samples = [initial_memory]
        
        for i in range(num_batches):
            file_ids = [f"memory_test_{i}_{j}" for j in range(batch_size)]
            batch_request = BatchJobRequest(
                name=f"Memory Test Batch {i}",
                file_ids=file_ids,
                pipeline_id="content_analysis",
                priority=JobPriority.MEDIUM
            )
            
            batch_job = await batch_processor.create_batch_job(batch_request)
            await batch_processor.process_batch_job_async(batch_job.batch_id)
            
            # Measure memory after each batch
            current_memory = process.memory_info().rss / 1024 / 1024  # MB
            memory_samples.append(current_memory)
        
        # Calculate memory growth
        max_memory = max(memory_samples)
        memory_growth = max_memory - initial_memory
        avg_memory = statistics.mean(memory_samples)
        
        print(f"Memory usage load test:")
        print(f"  Initial memory: {initial_memory:.2f} MB")
        print(f"  Max memory: {max_memory:.2f} MB")
        print(f"  Memory growth: {memory_growth:.2f} MB")
        print(f"  Average memory: {avg_memory:.2f} MB")
        
        # Memory should not grow excessively
        assert memory_growth < 500  # Less than 500MB growth
    
    @pytest.mark.asyncio
    async def test_resource_cleanup_load(self, mock_services, load_test_config):
        """Test resource cleanup under load"""
        batch_processor = mock_services['batch_processor']
        batch_size = load_test_config['small_batch_size']
        
        # Create and complete many batches
        num_batches = 10
        batch_ids = []
        
        for i in range(num_batches):
            file_ids = [f"cleanup_test_{i}_{j}" for j in range(batch_size)]
            batch_request = BatchJobRequest(
                name=f"Cleanup Test Batch {i}",
                file_ids=file_ids,
                pipeline_id="image_resize",
                priority=JobPriority.MEDIUM
            )
            
            batch_job = await batch_processor.create_batch_job(batch_request)
            batch_ids.append(batch_job.batch_id)
            
            await batch_processor.process_batch_job_async(batch_job.batch_id)
        
        # Verify all batches completed
        for batch_id in batch_ids:
            completed_batch = await batch_processor.get_batch_job(batch_id)
            assert completed_batch.status == JobStatus.COMPLETED
        
        # Test cleanup
        cleaned_count = await batch_processor.cleanup_completed_batch_jobs(older_than_hours=0)
        assert cleaned_count >= num_batches
        
        # Verify batches were cleaned up
        for batch_id in batch_ids:
            cleaned_batch = await batch_processor.get_batch_job(batch_id)
            assert cleaned_batch is None  # Should be cleaned up
        
        print(f"Resource cleanup: {cleaned_count} batches cleaned up")
    
    def test_load_test_configuration(self, load_test_config):
        """Test load test configuration"""
        assert load_test_config['small_batch_size'] > 0
        assert load_test_config['medium_batch_size'] > load_test_config['small_batch_size']
        assert load_test_config['large_batch_size'] > load_test_config['medium_batch_size']
        assert load_test_config['concurrent_batches'] > 0
        assert load_test_config['test_duration_seconds'] > 0
        assert load_test_config['max_wait_time_seconds'] > 0
    
    @pytest.mark.asyncio
    async def test_load_test_metrics_collection(self, mock_services, load_test_config):
        """Test comprehensive metrics collection during load testing"""
        batch_processor = mock_services['batch_processor']
        batch_size = load_test_config['small_batch_size']
        
        # Metrics to collect
        metrics = {
            'batch_creation_times': [],
            'batch_processing_times': [],
            'file_processing_times': [],
            'error_counts': 0,
            'success_counts': 0
        }
        
        # Run multiple batches and collect metrics
        num_batches = 5
        
        for i in range(num_batches):
            # Measure batch creation time
            creation_start = time.time()
            
            file_ids = [f"metrics_test_{i}_{j}" for j in range(batch_size)]
            batch_request = BatchJobRequest(
                name=f"Metrics Test Batch {i}",
                file_ids=file_ids,
                pipeline_id="image_resize",
                priority=JobPriority.MEDIUM
            )
            
            batch_job = await batch_processor.create_batch_job(batch_request)
            
            creation_end = time.time()
            metrics['batch_creation_times'].append(creation_end - creation_start)
            
            # Measure batch processing time
            processing_start = time.time()
            
            await batch_processor.process_batch_job_async(batch_job.batch_id)
            
            processing_end = time.time()
            metrics['batch_processing_times'].append(processing_end - processing_start)
            
            # Count successes and failures
            completed_batch = await batch_processor.get_batch_job(batch_job.batch_id)
            metrics['success_counts'] += completed_batch.result.successful_jobs
            metrics['error_counts'] += completed_batch.result.failed_jobs
        
        # Calculate and display metrics
        avg_creation_time = statistics.mean(metrics['batch_creation_times'])
        avg_processing_time = statistics.mean(metrics['batch_processing_times'])
        total_files = num_batches * batch_size
        success_rate = metrics['success_counts'] / total_files
        
        print(f"Load test metrics:")
        print(f"  Avg batch creation time: {avg_creation_time:.4f}s")
        print(f"  Avg batch processing time: {avg_processing_time:.2f}s")
        print(f"  Total files processed: {total_files}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Success count: {metrics['success_counts']}")
        print(f"  Error count: {metrics['error_counts']}")
        
        # Assertions
        assert avg_creation_time > 0
        assert avg_processing_time > 0
        assert success_rate > 0
        assert metrics['success_counts'] + metrics['error_counts'] == total_files
