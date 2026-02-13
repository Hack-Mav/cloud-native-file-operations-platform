import os
import asyncio
from typing import Dict, Any, List, Optional
from pathlib import Path
import logging
from datetime import datetime

from ..models import (
    ProcessingPipeline, PipelineStep, ProcessingType, Job, JobStatus, JobProgress
)
from .image_processor import ImageProcessor
from .document_processor import DocumentProcessor
from .video_processor import VideoProcessor
from .content_analyzer import ContentAnalyzer
from ..config import Settings

logger = logging.getLogger(__name__)

class ProcessingService:
    """Main processing service that orchestrates different processing pipelines"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.temp_dir = Path(settings.temp_dir)
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize processors
        self.image_processor = ImageProcessor(str(self.temp_dir))
        self.document_processor = DocumentProcessor(str(self.temp_dir))
        self.video_processor = VideoProcessor(str(self.temp_dir))
        self.content_analyzer = ContentAnalyzer(str(self.temp_dir))
        
        # Built-in pipelines
        self.built_in_pipelines = self._create_built_in_pipelines()
        
        # Custom pipelines storage (in production, this would be in database)
        self.custom_pipelines: Dict[str, ProcessingPipeline] = {}
    
    def _create_built_in_pipelines(self) -> Dict[str, ProcessingPipeline]:
        """Create built-in processing pipelines"""
        pipelines = {}
        
        # Image resize pipeline
        image_resize_pipeline = ProcessingPipeline(
            pipeline_id="image_resize",
            name="Image Resize",
            description="Resize images to specified dimensions",
            steps=[
                PipelineStep(
                    name="resize_image",
                    processing_type=ProcessingType.IMAGE_RESIZE,
                    parameters={
                        "width": 800,
                        "height": 600,
                        "maintain_aspect_ratio": True,
                        "quality": 85
                    }
                )
            ],
            input_formats=['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'],
            output_formats=['.jpg', '.png', '.webp']
        )
        pipelines["image_resize"] = image_resize_pipeline
        
        # Image optimization pipeline
        image_optimize_pipeline = ProcessingPipeline(
            pipeline_id="image_optimize",
            name="Image Optimization",
            description="Optimize images for web use",
            steps=[
                PipelineStep(
                    name="resize_image",
                    processing_type=ProcessingType.IMAGE_RESIZE,
                    parameters={
                        "width": 1920,
                        "height": 1080,
                        "maintain_aspect_ratio": True,
                        "upscale": False
                    }
                ),
                PipelineStep(
                    name="optimize_image",
                    processing_type=ProcessingType.IMAGE_FORMAT_CONVERT,
                    parameters={
                        "target_format": "webp",
                        "quality": 80
                    }
                )
            ],
            input_formats=['.jpg', '.jpeg', '.png', '.bmp', '.tiff'],
            output_formats=['.webp']
        )
        pipelines["image_optimize"] = image_optimize_pipeline
        
        # Document text extraction pipeline
        document_extract_pipeline = ProcessingPipeline(
            pipeline_id="document_extract",
            name="Document Text Extraction",
            description="Extract text from documents",
            steps=[
                PipelineStep(
                    name="extract_text",
                    processing_type=ProcessingType.DOCUMENT_TEXT_EXTRACT,
                    parameters={
                        "extract_images": False,
                        "preserve_layout": True
                    }
                )
            ],
            input_formats=['.pdf', '.docx', '.doc', '.txt'],
            output_formats=['.txt']
        )
        pipelines["document_extract"] = document_extract_pipeline
        
        # Video thumbnail pipeline
        video_thumbnail_pipeline = ProcessingPipeline(
            pipeline_id="video_thumbnail",
            name="Video Thumbnail Generation",
            description="Generate thumbnails from videos",
            steps=[
                PipelineStep(
                    name="generate_thumbnail",
                    processing_type=ProcessingType.VIDEO_THUMBNAIL,
                    parameters={
                        "width": 320,
                        "height": 240,
                        "quality": 75,
                        "count": 3
                    }
                )
            ],
            input_formats=['.mp4', '.avi', '.mov', '.mkv', '.webm'],
            output_formats=['.jpg']
        )
        pipelines["video_thumbnail"] = video_thumbnail_pipeline
        
        # Video compression pipeline
        video_compress_pipeline = ProcessingPipeline(
            pipeline_id="video_compress",
            name="Video Compression",
            description="Compress videos for web delivery",
            steps=[
                PipelineStep(
                    name="compress_video",
                    processing_type=ProcessingType.VIDEO_COMPRESS,
                    parameters={
                        "target_quality": "medium",
                        "target_bitrate": "1M",
                        "preset": "medium"
                    }
                )
            ],
            input_formats=['.mp4', '.avi', '.mov', '.mkv'],
            output_formats=['.mp4']
        )
        pipelines["video_compress"] = video_compress_pipeline
        
        # Content analysis pipeline
        content_analysis_pipeline = ProcessingPipeline(
            pipeline_id="content_analysis",
            name="Content Analysis",
            description="Analyze and classify file content",
            steps=[
                PipelineStep(
                    name="analyze_content",
                    processing_type=ProcessingType.CONTENT_ANALYSIS,
                    parameters={
                        "extract_metadata": True,
                        "scan_for_sensitive": True,
                        "content_classification": True
                    }
                )
            ],
            input_formats=['.jpg', '.jpeg', '.png', '.pdf', '.docx', '.txt', '.mp4'],
            output_formats=[]
        )
        pipelines["content_analysis"] = content_analysis_pipeline
        
        return pipelines
    
    async def list_pipelines(self) -> List[ProcessingPipeline]:
        """List all available pipelines"""
        all_pipelines = {}
        all_pipelines.update(self.built_in_pipelines)
        all_pipelines.update(self.custom_pipelines)
        return list(all_pipelines.values())
    
    async def get_pipeline(self, pipeline_id: str) -> Optional[ProcessingPipeline]:
        """Get a specific pipeline by ID"""
        all_pipelines = {}
        all_pipelines.update(self.built_in_pipelines)
        all_pipelines.update(self.custom_pipelines)
        return all_pipelines.get(pipeline_id)
    
    async def create_custom_pipeline(self, pipeline: ProcessingPipeline) -> ProcessingPipeline:
        """Create a custom processing pipeline"""
        # Validate pipeline
        validation_result = await self._validate_pipeline(pipeline)
        if not validation_result['valid']:
            raise ValueError(f"Invalid pipeline: {validation_result['errors']}")
        
        # Store custom pipeline
        self.custom_pipelines[pipeline.pipeline_id] = pipeline
        
        logger.info(f"Created custom pipeline: {pipeline.pipeline_id}")
        return pipeline
    
    async def _validate_pipeline(self, pipeline: ProcessingPipeline) -> Dict[str, Any]:
        """Validate a processing pipeline"""
        errors = []
        
        # Check if pipeline has steps
        if not pipeline.steps:
            errors.append("Pipeline must have at least one step")
        
        # Validate each step
        for i, step in enumerate(pipeline.steps):
            if not step.name:
                errors.append(f"Step {i+1} must have a name")
            
            if not step.processing_type:
                errors.append(f"Step {i+1} must have a processing type")
            
            # Validate dependencies
            for dep in step.depends_on:
                dep_found = False
                for other_step in pipeline.steps:
                    if other_step.step_id == dep:
                        dep_found = True
                        break
                if not dep_found:
                    errors.append(f"Step {i+1} depends on non-existent step: {dep}")
        
        return {
            'valid': len(errors) == 0,
            'errors': errors
        }
    
    async def process_file(
        self,
        file_path: str,
        pipeline: ProcessingPipeline,
        job: Job,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        Process a file through a pipeline
        
        Args:
            file_path: Path to the file to process
            pipeline: Processing pipeline to use
            job: Job object for tracking progress
            progress_callback: Optional callback for progress updates
        
        Returns:
            Dict with processing results
        """
        try:
            results = {
                'success': True,
                'pipeline_id': pipeline.pipeline_id,
                'processed_files': [],
                'metadata': {},
                'errors': []
            }
            
            # Validate input format
            file_ext = Path(file_path).suffix.lower()
            if pipeline.input_formats and file_ext not in pipeline.input_formats:
                return {
                    'success': False,
                    'error': f'File format {file_ext} not supported by pipeline {pipeline.pipeline_id}'
                }
            
            # Create working directory
            work_dir = self.temp_dir / f"job_{job.job_id}"
            work_dir.mkdir(parents=True, exist_ok=True)
            
            current_file = file_path
            step_results = {}
            
            # Process each step in order
            for step_index, step in enumerate(pipeline.steps):
                try:
                    # Update progress
                    progress = JobProgress(
                        current_step=step_index + 1,
                        total_steps=len(pipeline.steps),
                        step_name=step.name,
                        progress_percentage=(step_index / len(pipeline.steps)) * 100,
                        message=f"Processing step: {step.name}"
                    )
                    
                    if progress_callback:
                        await progress_callback(job.job_id, progress)
                    
                    # Process step
                    step_result = await self._process_step(
                        current_file, step, work_dir, job.job_id
                    )
                    
                    step_results[step.step_id] = step_result
                    
                    if step_result['success']:
                        # Update current file for next step
                        if 'output_files' in step_result and step_result['output_files']:
                            current_file = step_result['output_files'][0]
                        
                        # Add to results
                        if 'output_files' in step_result:
                            results['processed_files'].extend(step_result['output_files'])
                        
                        if 'metadata' in step_result:
                            results['metadata'].update(step_result['metadata'])
                    
                    else:
                        # Step failed
                        error_msg = f"Step {step.name} failed: {step_result.get('error', 'Unknown error')}"
                        results['errors'].append(error_msg)
                        results['success'] = False
                        
                        # Check if we should retry
                        if step.retry_count > 0:
                            logger.warning(f"Step {step.name} failed, retrying...")
                            # Implement retry logic here
                            pass
                        else:
                            break
                
                except Exception as e:
                    error_msg = f"Exception in step {step.name}: {str(e)}"
                    logger.error(error_msg)
                    results['errors'].append(error_msg)
                    results['success'] = False
                    break
            
            # Final progress update
            final_progress = JobProgress(
                current_step=len(pipeline.steps),
                total_steps=len(pipeline.steps),
                step_name="completed",
                progress_percentage=100.0,
                message="Processing completed"
            )
            
            if progress_callback:
                await progress_callback(job.job_id, final_progress)
            
            # Clean up working directory
            try:
                import shutil
                shutil.rmtree(work_dir)
            except:
                pass
            
            return results
            
        except Exception as e:
            logger.error(f"Error processing file {file_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _process_step(
        self,
        input_file: str,
        step: PipelineStep,
        work_dir: Path,
        job_id: str
    ) -> Dict[str, Any]:
        """Process a single pipeline step"""
        try:
            # Generate output filename
            input_path = Path(input_file)
            output_file = work_dir / f"{step.step_id}_{input_path.name}"
            
            # Process based on type
            if step.processing_type == ProcessingType.IMAGE_RESIZE:
                return await self._process_image_resize(input_file, str(output_file), step.parameters)
            
            elif step.processing_type == ProcessingType.IMAGE_FORMAT_CONVERT:
                return await self._process_image_format_convert(input_file, str(output_file), step.parameters)
            
            elif step.processing_type == ProcessingType.DOCUMENT_TEXT_EXTRACT:
                return await self._process_document_text_extract(input_file, str(output_file), step.parameters)
            
            elif step.processing_type == ProcessingType.DOCUMENT_PDF_GENERATE:
                return await self._process_document_pdf_generate(input_file, str(output_file), step.parameters)
            
            elif step.processing_type == ProcessingType.VIDEO_THUMBNAIL:
                return await self._process_video_thumbnail(input_file, str(output_file), step.parameters)
            
            elif step.processing_type == ProcessingType.VIDEO_COMPRESS:
                return await self._process_video_compress(input_file, str(output_file), step.parameters)
            
            elif step.processing_type == ProcessingType.CONTENT_ANALYSIS:
                return await self._process_content_analysis(input_file, step.parameters)
            
            elif step.processing_type == ProcessingType.CUSTOM:
                return await self._process_custom_step(input_file, str(output_file), step.parameters)
            
            else:
                return {
                    'success': False,
                    'error': f'Unsupported processing type: {step.processing_type}'
                }
                
        except Exception as e:
            logger.error(f"Error processing step {step.name}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _process_image_resize(self, input_file: str, output_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process image resize step"""
        result = await self.image_processor.resize_image(
            input_file,
            output_file,
            width=params.get('width', 800),
            height=params.get('height', 600),
            maintain_aspect_ratio=params.get('maintain_aspect_ratio', True),
            upscale=params.get('upscale', False),
            quality=params.get('quality', 85)
        )
        
        if result['success']:
            result['output_files'] = [output_file]
        
        return result
    
    async def _process_image_format_convert(self, input_file: str, output_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process image format conversion step"""
        target_format = params.get('target_format', 'jpg')
        if not output_file.endswith(f'.{target_format}'):
            output_file = str(Path(output_file).with_suffix(f'.{target_format}'))
        
        result = await self.image_processor.convert_format(
            input_file,
            output_file,
            target_format,
            quality=params.get('quality', 85),
            preserve_metadata=params.get('preserve_metadata', True)
        )
        
        if result['success']:
            result['output_files'] = [output_file]
        
        return result
    
    async def _process_document_text_extract(self, input_file: str, output_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process document text extraction step"""
        file_ext = Path(input_file).suffix.lower()
        
        if file_ext == '.pdf':
            result = await self.document_processor.extract_text_from_pdf(
                input_file,
                extract_images=params.get('extract_images', False),
                preserve_layout=params.get('preserve_layout', True)
            )
        elif file_ext in ['.docx', '.doc']:
            result = await self.document_processor.extract_text_from_docx(
                input_file,
                extract_images=params.get('extract_images', False)
            )
        else:
            return {
                'success': False,
                'error': f'Unsupported document format: {file_ext}'
            }
        
        if result['success']:
            # Save extracted text to output file
            full_text = ""
            if 'text_content' in result:
                for page_content in result['text_content']:
                    full_text += page_content['text'] + "\n\n"
            elif 'paragraphs' in result:
                for para in result['paragraphs']:
                    full_text += para['text'] + "\n"
            
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(full_text)
            
            result['output_files'] = [output_file]
            result['metadata'] = {
                'extracted_characters': len(full_text),
                'extraction_method': file_ext
            }
        
        return result
    
    async def _process_document_pdf_generate(self, input_file: str, output_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process PDF generation step"""
        file_ext = Path(input_file).suffix.lower()
        
        if file_ext in ['.txt', '.text']:
            with open(input_file, 'r', encoding='utf-8') as f:
                text_content = f.read()
            
            result = await self.document_processor.generate_pdf_from_text(
                text_content,
                output_file,
                title=params.get('title', 'Generated PDF'),
                author=params.get('author', ''),
                font_size=params.get('font_size', 12)
            )
        else:
            result = await self.document_processor.convert_document_format(
                input_file,
                output_file,
                'pdf'
            )
        
        if result['success']:
            result['output_files'] = [output_file]
        
        return result
    
    async def _process_video_thumbnail(self, input_file: str, output_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process video thumbnail generation step"""
        count = params.get('count', 1)
        
        if count == 1:
            result = await self.video_processor.generate_thumbnail(
                input_file,
                output_file,
                timestamp=params.get('timestamp'),
                width=params.get('width'),
                height=params.get('height'),
                quality=params.get('quality', 85)
            )
            
            if result['success']:
                result['output_files'] = [output_file]
        else:
            # Generate multiple thumbnails
            output_dir = Path(output_file).parent
            result = await self.video_processor.generate_multiple_thumbnails(
                input_file,
                str(output_dir),
                count=count,
                width=params.get('width'),
                height=params.get('height'),
                quality=params.get('quality', 85)
            )
            
            if result['success']:
                result['output_files'] = [thumb['path'] for thumb in result['thumbnails']]
        
        return result
    
    async def _process_video_compress(self, input_file: str, output_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process video compression step"""
        result = await self.video_processor.compress_video(
            input_file,
            output_file,
            target_quality=params.get('target_quality'),
            target_bitrate=params.get('target_bitrate'),
            target_size_mb=params.get('target_size_mb'),
            resolution=params.get('resolution'),
            preset=params.get('preset', 'medium')
        )
        
        if result['success']:
            result['output_files'] = [output_file]
        
        return result
    
    async def _process_content_analysis(self, input_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process content analysis step"""
        result = await self.content_analyzer.analyze_file(
            input_file,
            extract_metadata=params.get('extract_metadata', True),
            scan_for_sensitive=params.get('scan_for_sensitive', True),
            content_classification=params.get('content_classification', True)
        )
        
        # Content analysis doesn't produce output files, just metadata
        if result['success']:
            result['metadata'] = {
                'content_analysis': result,
                'analysis_timestamp': datetime.utcnow().isoformat()
            }
        
        return result
    
    async def _process_custom_step(self, input_file: str, output_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process custom step (placeholder for future extension)"""
        # This is a placeholder for custom processing logic
        # In a real implementation, this could call external services or custom code
        
        custom_command = params.get('command')
        if custom_command:
            # Execute custom command (with proper security measures)
            import subprocess
            try:
                # WARNING: This is a simplified example. In production, proper
                # sandboxing and security measures are required
                cmd = custom_command.format(input=input_file, output=output_file)
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                
                if result.returncode == 0:
                    return {
                        'success': True,
                        'output_files': [output_file],
                        'metadata': {
                            'custom_command': custom_command,
                            'stdout': result.stdout
                        }
                    }
                else:
                    return {
                        'success': False,
                        'error': f'Custom command failed: {result.stderr}'
                    }
            except Exception as e:
                return {
                    'success': False,
                    'error': f'Error executing custom command: {str(e)}'
                }
        else:
            return {
                'success': False,
                'error': 'No custom command specified'
            }
