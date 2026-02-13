import pytest
import asyncio
from pathlib import Path
from PIL import Image

from services.processing_service.services.image_processor import ImageProcessor

class TestImageProcessor:
    """Test cases for ImageProcessor"""
    
    @pytest.fixture
    def image_processor(self, temp_dir):
        """Create image processor instance"""
        return ImageProcessor(str(temp_dir))
    
    @pytest.fixture
    def sample_image(self, temp_dir):
        """Create a sample image for testing"""
        image_path = temp_dir / "sample.jpg"
        img = Image.new('RGB', (800, 600), color='blue')
        img.save(image_path, 'JPEG', quality=95)
        return image_path
    
    @pytest.mark.asyncio
    async def test_resize_image_maintain_aspect_ratio(self, image_processor, sample_image, temp_dir):
        """Test image resizing with aspect ratio maintained"""
        output_path = temp_dir / "resized.jpg"
        
        result = await image_processor.resize_image(
            str(sample_image),
            str(output_path),
            width=400,
            height=400,
            maintain_aspect_ratio=True
        )
        
        assert result['success'] is True
        assert output_path.exists()
        
        # Check dimensions
        with Image.open(output_path) as img:
            assert img.size[0] <= 400
            assert img.size[1] <= 400
            # Aspect ratio should be maintained (800:600 = 4:3)
            assert abs((img.size[0] / img.size[1]) - (4/3)) < 0.1
    
    @pytest.mark.asyncio
    async def test_resize_image_exact_dimensions(self, image_processor, sample_image, temp_dir):
        """Test image resizing to exact dimensions"""
        output_path = temp_dir / "resized_exact.jpg"
        
        result = await image_processor.resize_image(
            str(sample_image),
            str(output_path),
            width=300,
            height=200,
            maintain_aspect_ratio=False
        )
        
        assert result['success'] is True
        assert output_path.exists()
        
        # Check exact dimensions
        with Image.open(output_path) as img:
            assert img.size == (300, 200)
    
    @pytest.mark.asyncio
    async def test_convert_format_jpg_to_png(self, image_processor, sample_image, temp_dir):
        """Test format conversion from JPG to PNG"""
        output_path = temp_dir / "converted.png"
        
        result = await image_processor.convert_format(
            str(sample_image),
            str(output_path),
            "png"
        )
        
        assert result['success'] is True
        assert output_path.exists()
        
        # Check format
        with Image.open(output_path) as img:
            assert img.format == 'PNG'
    
    @pytest.mark.asyncio
    async def test_convert_format_png_to_jpg(self, image_processor, temp_dir):
        """Test format conversion from PNG to JPG"""
        # Create PNG image
        png_path = temp_dir / "source.png"
        img = Image.new('RGBA', (100, 100), color=(255, 0, 0, 128))
        img.save(png_path, 'PNG')
        
        output_path = temp_dir / "converted.jpg"
        
        result = await image_processor.convert_format(
            str(png_path),
            str(output_path),
            "jpg"
        )
        
        assert result['success'] is True
        assert output_path.exists()
        
        # Check format (should be RGB now, not RGBA)
        with Image.open(output_path) as img:
            assert img.format == 'JPEG'
            assert img.mode == 'RGB'
    
    @pytest.mark.asyncio
    async def test_apply_filters_brightness(self, image_processor, sample_image, temp_dir):
        """Test applying brightness filter"""
        output_path = temp_dir / "brightened.jpg"
        
        filters = [
            {
                'type': 'brightness',
                'parameters': {'factor': 1.5}
            }
        ]
        
        result = await image_processor.apply_filters(
            str(sample_image),
            str(output_path),
            filters
        )
        
        assert result['success'] is True
        assert output_path.exists()
        assert result['filters_applied'] == 1
    
    @pytest.mark.asyncio
    async def test_apply_multiple_filters(self, image_processor, sample_image, temp_dir):
        """Test applying multiple filters"""
        output_path = temp_dir / "filtered.jpg"
        
        filters = [
            {
                'type': 'brightness',
                'parameters': {'factor': 1.2}
            },
            {
                'type': 'contrast',
                'parameters': {'factor': 1.1}
            },
            {
                'type': 'sharpness',
                'parameters': {'factor': 1.3}
            }
        ]
        
        result = await image_processor.apply_filters(
            str(sample_image),
            str(output_path),
            filters
        )
        
        assert result['success'] is True
        assert output_path.exists()
        assert result['filters_applied'] == 3
    
    @pytest.mark.asyncio
    async def test_create_thumbnails(self, image_processor, sample_image, temp_dir):
        """Test creating multiple thumbnails"""
        output_dir = temp_dir / "thumbnails"
        sizes = [(50, 50), (100, 100), (200, 200)]
        
        result = await image_processor.create_thumbnails(
            str(sample_image),
            str(output_dir),
            sizes
        )
        
        assert result['success'] is True
        assert result['thumbnails_generated'] == 3
        assert output_dir.exists()
        
        # Check that all thumbnails were created
        for width, height in sizes:
            thumbnail_files = list(output_dir.glob(f"*{width}x{height}.jpg"))
            assert len(thumbnail_files) == 1
    
    @pytest.mark.asyncio
    async def test_optimize_image(self, image_processor, sample_image, temp_dir):
        """Test image optimization"""
        output_path = temp_dir / "optimized.jpg"
        
        result = await image_processor.optimize_image(
            str(sample_image),
            str(output_path)
        )
        
        assert result['success'] is True
        assert output_path.exists()
        assert result['size_reduction_percent'] >= 0
    
    @pytest.mark.asyncio
    async def test_optimize_image_with_target_size(self, image_processor, temp_dir):
        """Test image optimization with target file size"""
        # Create a larger image
        large_image_path = temp_dir / "large.jpg"
        img = Image.new('RGB', (2000, 1500), color='green')
        img.save(large_image_path, 'JPEG', quality=100)
        
        output_path = temp_dir / "optimized_target.jpg"
        
        result = await image_processor.optimize_image(
            str(large_image_path),
            str(output_path),
            target_size_kb=50  # Target 50KB
        )
        
        assert result['success'] is True
        assert output_path.exists()
        
        # Check that file size is close to target
        file_size_kb = output_path.stat().st_size / 1024
        assert file_size_kb <= 60  # Allow some tolerance
    
    def test_is_supported_format_input(self, image_processor):
        """Test supported input format checking"""
        assert image_processor.is_supported_format("test.jpg", "input") is True
        assert image_processor.is_supported_format("test.png", "input") is True
        assert image_processor.is_supported_format("test.gif", "input") is True
        assert image_processor.is_supported_format("test.txt", "input") is False
        assert image_processor.is_supported_format("test.pdf", "input") is False
    
    def test_is_supported_format_output(self, image_processor):
        """Test supported output format checking"""
        assert image_processor.is_supported_format("test.jpg", "output") is True
        assert image_processor.is_supported_format("test.png", "output") is True
        assert image_processor.is_supported_format("test.webp", "output") is True
        assert image_processor.is_supported_format("test.gif", "output") is False
        assert image_processor.is_supported_format("test.txt", "output") is False
    
    def test_get_image_info(self, image_processor, sample_image):
        """Test getting image information"""
        info = image_processor.get_image_info(str(sample_image))
        
        assert 'format' in info
        assert 'mode' in info
        assert 'size' in info
        assert 'file_size_bytes' in info
        assert info['format'] == 'JPEG'
        assert info['size'] == (800, 600)
    
    @pytest.mark.asyncio
    async def test_resize_invalid_file(self, image_processor, temp_dir):
        """Test resizing non-existent file"""
        output_path = temp_dir / "output.jpg"
        
        result = await image_processor.resize_image(
            "non_existent.jpg",
            str(output_path),
            width=100,
            height=100
        )
        
        assert result['success'] is False
        assert 'error' in result
    
    @pytest.mark.asyncio
    async def test_convert_unsupported_format(self, image_processor, sample_image, temp_dir):
        """Test converting to unsupported format"""
        output_path = temp_dir / "converted.xyz"
        
        result = await image_processor.convert_format(
            str(sample_image),
            str(output_path),
            "xyz"
        )
        
        # Should still succeed but use default format
        assert result['success'] is True
        assert output_path.exists()
