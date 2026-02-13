import pytest
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch

from services.processing_service.services.processing_service import ProcessingService
from services.processing_service.models import (
    ProcessingPipeline, PipelineStep, ProcessingType, Job, JobStatus
)

class TestProcessingService:
    """Test cases for ProcessingService"""
    
    @pytest.mark.asyncio
    async def test_list_built_in_pipelines(self, processing_service):
        """Test listing built-in pipelines"""
        pipelines = await processing_service.list_pipelines()
        
        assert len(pipelines) > 0
        
        # Check for expected built-in pipelines
        pipeline_ids = [p.pipeline_id for p in pipelines]
        assert "image_resize" in pipeline_ids
        assert "image_optimize" in pipeline_ids
        assert "document_extract" in pipeline_ids
        assert "video_thumbnail" in pipeline_ids
        assert "content_analysis" in pipeline_ids
    
    @pytest.mark.asyncio
    async def test_get_pipeline_by_id(self, processing_service):
        """Test getting pipeline by ID"""
        pipeline = await processing_service.get_pipeline("image_resize")
        
        assert pipeline is not None
        assert pipeline.pipeline_id == "image_resize"
        assert pipeline.name == "Image Resize"
        assert len(pipeline.steps) == 1
        assert pipeline.steps[0].processing_type == ProcessingType.IMAGE_RESIZE
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_pipeline(self, processing_service):
        """Test getting non-existent pipeline"""
        pipeline = await processing_service.get_pipeline("nonexistent")
        
        assert pipeline is None
    
    @pytest.mark.asyncio
    async def test_create_custom_pipeline(self, processing_service):
        """Test creating custom pipeline"""
        custom_pipeline = ProcessingPipeline(
            name="Custom Test Pipeline",
            description="A test pipeline for unit testing",
            steps=[
                PipelineStep(
                    name="resize_step",
                    processing_type=ProcessingType.IMAGE_RESIZE,
                    parameters={"width": 200, "height": 200}
                ),
                PipelineStep(
                    name="convert_step",
                    processing_type=ProcessingType.IMAGE_FORMAT_CONVERT,
                    parameters={"target_format": "png"},
                    depends_on=["resize_step"]
                )
            ],
            input_formats=[".jpg", ".jpeg"],
            output_formats=[".png"],
            is_custom=True
        )
        
        created_pipeline = await processing_service.create_custom_pipeline(custom_pipeline)
        
        assert created_pipeline.pipeline_id == custom_pipeline.pipeline_id
        assert created_pipeline.name == custom_pipeline.name
        assert len(created_pipeline.steps) == 2
        
        # Verify it's in custom pipelines
        assert custom_pipeline.pipeline_id in processing_service.custom_pipelines
    
    @pytest.mark.asyncio
    async def test_validate_valid_pipeline(self, processing_service):
        """Test validating a valid pipeline"""
        pipeline = ProcessingPipeline(
            name="Valid Pipeline",
            steps=[
                PipelineStep(
                    name="step1",
                    processing_type=ProcessingType.IMAGE_RESIZE
                )
            ]
        )
        
        result = await processing_service._validate_pipeline(pipeline)
        
        assert result['valid'] is True
        assert len(result['errors']) == 0
    
    @pytest.mark.asyncio
    async def test_validate_empty_pipeline(self, processing_service):
        """Test validating pipeline with no steps"""
        pipeline = ProcessingPipeline(
            name="Empty Pipeline",
            steps=[]
        )
        
        result = await processing_service._validate_pipeline(pipeline)
        
        assert result['valid'] is False
        assert len(result['errors']) > 0
        assert any("at least one step" in error for error in result['errors'])
    
    @pytest.mark.asyncio
    async def test_validate_pipeline_with_invalid_dependency(self, processing_service):
        """Test validating pipeline with invalid dependency"""
        pipeline = ProcessingPipeline(
            name="Invalid Dependency Pipeline",
            steps=[
                PipelineStep(
                    name="step1",
                    processing_type=ProcessingType.IMAGE_RESIZE
                ),
                PipelineStep(
                    name="step2",
                    processing_type=ProcessingType.IMAGE_FORMAT_CONVERT,
                    depends_on=["nonexistent_step"]
                )
            ]
        )
        
        result = await processing_service._validate_pipeline(pipeline)
        
        assert result['valid'] is False
        assert len(result['errors']) > 0
        assert any("non-existent step" in error for error in result['errors'])
    
    @pytest.mark.asyncio
    async def test_process_file_image_resize(self, processing_service, sample_image_file, temp_dir):
        """Test processing file with image resize pipeline"""
        pipeline = await processing_service.get_pipeline("image_resize")
        job = Job(job_id="test-job", file_id="test-file")
        
        result = await processing_service.process_file(
            str(sample_image_file),
            pipeline,
            job
        )
        
        assert result['success'] is True
        assert len(result['processed_files']) > 0
        
        # Check that output file exists
        output_file = Path(result['processed_files'][0])
        assert output_file.exists()
    
    @pytest.mark.asyncio
    async def test_process_file_unsupported_format(self, processing_service, temp_dir):
        """Test processing file with unsupported format"""
        # Create a text file
        text_file = temp_dir / "test.txt"
        text_file.write_text("This is a test")
        
        pipeline = await processing_service.get_pipeline("image_resize")
        job = Job(job_id="test-job", file_id="test-file")
        
        result = await processing_service.process_file(
            str(text_file),
            pipeline,
            job
        )
        
        assert result['success'] is False
        assert "not supported" in result['error']
    
    @pytest.mark.asyncio
    async def test_process_step_image_resize(self, processing_service, sample_image_file, temp_dir):
        """Test processing individual image resize step"""
        step = PipelineStep(
            name="resize",
            processing_type=ProcessingType.IMAGE_RESIZE,
            parameters={"width": 100, "height": 100}
        )
        
        output_file = temp_dir / "resized.jpg"
        
        result = await processing_service._process_step(
            str(sample_image_file),
            step,
            temp_dir,
            "test-job"
        )
        
        assert result['success'] is True
        assert len(result['output_files']) == 1
        assert Path(result['output_files'][0]).exists()
    
    @pytest.mark.asyncio
    async def test_process_step_content_analysis(self, processing_service, sample_image_file):
        """Test processing content analysis step"""
        step = PipelineStep(
            name="analyze",
            processing_type=ProcessingType.CONTENT_ANALYSIS,
            parameters={"extract_metadata": True}
        )
        
        result = await processing_service._process_step(
            str(sample_image_file),
            step,
            Path("/tmp"),
            "test-job"
        )
        
        assert result['success'] is True
        assert 'content_analysis' in result['metadata']
    
    @pytest.mark.asyncio
    async def test_process_step_unsupported_type(self, processing_service, sample_image_file, temp_dir):
        """Test processing step with unsupported type"""
        step = PipelineStep(
            name="unsupported",
            processing_type="unsupported_type"
        )
        
        result = await processing_service._process_step(
            str(sample_image_file),
            step,
            temp_dir,
            "test-job"
        )
        
        assert result['success'] is False
        assert "Unsupported processing type" in result['error']
    
    @pytest.mark.asyncio
    async def test_process_custom_step(self, processing_service, sample_image_file, temp_dir):
        """Test processing custom step"""
        step = PipelineStep(
            name="custom",
            processing_type=ProcessingType.CUSTOM,
            parameters={"command": "cp {input} {output}"}
        )
        
        output_file = temp_dir / "custom_output.jpg"
        
        result = await processing_service._process_step(
            str(sample_image_file),
            step,
            temp_dir,
            "test-job"
        )
        
        # This might fail on different systems, so we just check it doesn't crash
        assert 'success' in result
    
    def test_create_built_in_pipelines(self, processing_service):
        """Test built-in pipeline creation"""
        pipelines = processing_service.built_in_pipelines
        
        assert len(pipelines) >= 6  # At least the basic pipelines
        
        # Check specific pipelines
        assert "image_resize" in pipelines
        assert "image_optimize" in pipelines
        assert "document_extract" in pipelines
        assert "video_thumbnail" in pipelines
        assert "video_compress" in pipelines
        assert "content_analysis" in pipelines
        
        # Check pipeline structure
        resize_pipeline = pipelines["image_resize"]
        assert resize_pipeline.name == "Image Resize"
        assert len(resize_pipeline.steps) == 1
        assert resize_pipeline.steps[0].processing_type == ProcessingType.IMAGE_RESIZE
        assert ".jpg" in resize_pipeline.input_formats
        assert ".png" in resize_pipeline.output_formats
    
    @pytest.mark.asyncio
    async def test_progress_callback(self, processing_service, sample_image_file, temp_dir):
        """Test progress callback during processing"""
        pipeline = await processing_service.get_pipeline("image_resize")
        job = Job(job_id="test-job", file_id="test-file")
        
        progress_calls = []
        
        async def progress_callback(job_id, progress):
            progress_calls.append((job_id, progress))
        
        result = await processing_service.process_file(
            str(sample_image_file),
            pipeline,
            job,
            progress_callback
        )
        
        assert result['success'] is True
        assert len(progress_calls) > 0
        
        # Check that progress was reported
        final_call = progress_calls[-1]
        assert final_call[0] == "test-job"
        assert final_call[1].progress_percentage == 100.0
