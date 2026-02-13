import os
import io
import tempfile
from typing import Dict, Any, List, Tuple, Optional
from PIL import Image, ImageOps, ImageEnhance, ImageFilter
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class ImageProcessor:
    """Handles image processing operations including resize, format conversion, and optimization"""
    
    SUPPORTED_FORMATS = {
        'input': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
        'output': ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']
    }
    
    def __init__(self, temp_dir: str = "/tmp/processing"):
        self.temp_dir = Path(temp_dir)
        self.temp_dir.mkdir(parents=True, exist_ok=True)
    
    async def resize_image(
        self, 
        input_path: str, 
        output_path: str, 
        width: int, 
        height: int,
        maintain_aspect_ratio: bool = True,
        upscale: bool = False,
        quality: int = 85
    ) -> Dict[str, Any]:
        """
        Resize an image to specified dimensions
        
        Args:
            input_path: Path to input image
            output_path: Path for output image
            width: Target width
            height: Target height
            maintain_aspect_ratio: Whether to maintain aspect ratio
            upscale: Whether to upscale smaller images
            quality: JPEG quality (1-100)
        
        Returns:
            Dict with processing results and metadata
        """
        try:
            with Image.open(input_path) as img:
                original_width, original_height = img.size
                
                # Convert RGBA to RGB for JPEG output
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background
                
                # Calculate new dimensions
                if maintain_aspect_ratio:
                    img.thumbnail((width, height), Image.Resampling.LANCZOS)
                    new_width, new_height = img.size
                    
                    # Check if upscaling is needed and allowed
                    if not upscale and (new_width > original_width or new_height > original_height):
                        img = img.resize((original_width, original_height), Image.Resampling.LANCZOS)
                        new_width, new_height = original_width, original_height
                else:
                    img = img.resize((width, height), Image.Resampling.LANCZOS)
                    new_width, new_height = width, height
                
                # Save with appropriate format and quality
                save_kwargs = {}
                output_format = Path(output_path).suffix.lower()
                
                if output_format in ['.jpg', '.jpeg']:
                    save_kwargs.update({'format': 'JPEG', 'quality': quality, 'optimize': True})
                elif output_format == '.png':
                    save_kwargs.update({'format': 'PNG', 'optimize': True})
                elif output_format == '.webp':
                    save_kwargs.update({'format': 'WEBP', 'quality': quality, 'optimize': True})
                else:
                    save_kwargs['format'] = img.format or 'JPEG'
                
                img.save(output_path, **save_kwargs)
                
                # Get file sizes
                original_size = os.path.getsize(input_path)
                output_size = os.path.getsize(output_path)
                
                return {
                    'success': True,
                    'original_dimensions': (original_width, original_height),
                    'new_dimensions': (new_width, new_height),
                    'original_size_bytes': original_size,
                    'output_size_bytes': output_size,
                    'compression_ratio': output_size / original_size if original_size > 0 else 1,
                    'format': save_kwargs.get('format', img.format),
                    'quality': quality
                }
                
        except Exception as e:
            logger.error(f"Error resizing image {input_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def convert_format(
        self, 
        input_path: str, 
        output_path: str, 
        target_format: str,
        quality: int = 85,
        preserve_metadata: bool = True
    ) -> Dict[str, Any]:
        """
        Convert image to different format
        
        Args:
            input_path: Path to input image
            output_path: Path for output image
            target_format: Target format (jpg, png, webp, etc.)
            quality: Output quality for lossy formats
            preserve_metadata: Whether to preserve EXIF metadata
        
        Returns:
            Dict with conversion results
        """
        try:
            with Image.open(input_path) as img:
                original_format = img.format
                original_size = os.path.getsize(input_path)
                
                # Handle format-specific conversions
                if target_format.lower() in ['jpg', 'jpeg']:
                    # Convert to RGB for JPEG
                    if img.mode in ('RGBA', 'LA', 'P'):
                        background = Image.new('RGB', img.size, (255, 255, 255))
                        if img.mode == 'P':
                            img = img.convert('RGBA')
                        if img.mode == 'RGBA':
                            background.paste(img, mask=img.split()[-1])
                        else:
                            background.paste(img)
                        img = background
                    
                    save_kwargs = {
                        'format': 'JPEG',
                        'quality': quality,
                        'optimize': True,
                        'progressive': True
                    }
                
                elif target_format.lower() == 'png':
                    save_kwargs = {
                        'format': 'PNG',
                        'optimize': True,
                        'compress_level': 6
                    }
                
                elif target_format.lower() == 'webp':
                    save_kwargs = {
                        'format': 'WEBP',
                        'quality': quality,
                        'optimize': True,
                        'method': 6
                    }
                
                else:
                    # Default handling for other formats
                    save_kwargs = {'format': target_format.upper()}
                
                # Preserve metadata if requested and supported
                if preserve_metadata and hasattr(img, 'info'):
                    # Only preserve metadata that's compatible with target format
                    if target_format.lower() in ['jpg', 'jpeg']:
                        # JPEG doesn't support transparency
                        exif = img.info.get('exif')
                        if exif:
                            save_kwargs['exif'] = exif
                
                img.save(output_path, **save_kwargs)
                output_size = os.path.getsize(output_path)
                
                return {
                    'success': True,
                    'original_format': original_format,
                    'target_format': target_format.upper(),
                    'original_size_bytes': original_size,
                    'output_size_bytes': output_size,
                    'size_ratio': output_size / original_size if original_size > 0 else 1,
                    'dimensions': img.size,
                    'mode': img.mode
                }
                
        except Exception as e:
            logger.error(f"Error converting image format {input_path} to {target_format}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def apply_filters(
        self, 
        input_path: str, 
        output_path: str,
        filters: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Apply various image filters and enhancements
        
        Args:
            input_path: Path to input image
            output_path: Path for output image
            filters: List of filter dictionaries with type and parameters
        
        Returns:
            Dict with filter application results
        """
        try:
            with Image.open(input_path) as img:
                original_size = img.size
                
                for filter_config in filters:
                    filter_type = filter_config.get('type')
                    params = filter_config.get('parameters', {})
                    
                    if filter_type == 'brightness':
                        factor = params.get('factor', 1.0)
                        enhancer = ImageEnhance.Brightness(img)
                        img = enhancer.enhance(factor)
                    
                    elif filter_type == 'contrast':
                        factor = params.get('factor', 1.0)
                        enhancer = ImageEnhance.Contrast(img)
                        img = enhancer.enhance(factor)
                    
                    elif filter_type == 'saturation':
                        factor = params.get('factor', 1.0)
                        enhancer = ImageEnhance.Color(img)
                        img = enhancer.enhance(factor)
                    
                    elif filter_type == 'sharpness':
                        factor = params.get('factor', 1.0)
                        enhancer = ImageEnhance.Sharpness(img)
                        img = enhancer.enhance(factor)
                    
                    elif filter_type == 'blur':
                        radius = params.get('radius', 1.0)
                        img = img.filter(ImageFilter.GaussianBlur(radius=radius))
                    
                    elif filter_type == 'sharpen':
                        img = img.filter(ImageFilter.SHARPEN)
                    
                    elif filter_type == 'edge_enhance':
                        img = img.filter(ImageFilter.EDGE_ENHANCE)
                    
                    elif filter_type == 'emboss':
                        img = img.filter(ImageFilter.EMBOSS)
                    
                    elif filter_type == 'autocontrast':
                        img = ImageOps.autocontrast(img)
                    
                    elif filter_type == 'equalize':
                        img = ImageOps.equalize(img)
                    
                    elif filter_type == 'grayscale':
                        img = ImageOps.grayscale(img)
                
                # Determine output format based on file extension
                output_format = Path(output_path).suffix.lower()
                save_kwargs = {}
                
                if output_format in ['.jpg', '.jpeg']:
                    save_kwargs.update({'format': 'JPEG', 'quality': 85, 'optimize': True})
                elif output_format == '.png':
                    save_kwargs.update({'format': 'PNG', 'optimize': True})
                elif output_format == '.webp':
                    save_kwargs.update({'format': 'WEBP', 'quality': 85, 'optimize': True})
                else:
                    save_kwargs['format'] = img.format or 'JPEG'
                
                img.save(output_path, **save_kwargs)
                output_size = os.path.getsize(output_path)
                
                return {
                    'success': True,
                    'filters_applied': len(filters),
                    'original_dimensions': original_size,
                    'final_dimensions': img.size,
                    'original_size_bytes': os.path.getsize(input_path),
                    'output_size_bytes': output_size,
                    'format': save_kwargs.get('format', img.format)
                }
                
        except Exception as e:
            logger.error(f"Error applying filters to {input_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def create_thumbnails(
        self, 
        input_path: str, 
        output_dir: str,
        sizes: List[Tuple[int, int]],
        prefix: str = "thumb"
    ) -> Dict[str, Any]:
        """
        Create multiple thumbnails of different sizes
        
        Args:
            input_path: Path to input image
            output_dir: Directory to save thumbnails
            sizes: List of (width, height) tuples
            prefix: Prefix for thumbnail filenames
        
        Returns:
            Dict with thumbnail creation results
        """
        try:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            
            with Image.open(input_path) as img:
                original_size = img.size
                base_name = Path(input_path).stem
                thumbnails = []
                
                for width, height in sizes:
                    # Create a copy for this thumbnail
                    thumb_img = img.copy()
                    
                    # Generate thumbnail maintaining aspect ratio
                    thumb_img.thumbnail((width, height), Image.Resampling.LANCZOS)
                    
                    # Generate filename
                    thumb_filename = f"{prefix}_{base_name}_{width}x{height}.jpg"
                    thumb_path = output_dir / thumb_filename
                    
                    # Save thumbnail
                    thumb_img.save(thumb_path, 'JPEG', quality=85, optimize=True)
                    
                    thumbnails.append({
                        'size': (width, height),
                        'actual_size': thumb_img.size,
                        'path': str(thumb_path),
                        'file_size_bytes': os.path.getsize(thumb_path)
                    })
                
                return {
                    'success': True,
                    'original_dimensions': original_size,
                    'thumbnails_created': len(thumbnails),
                    'thumbnails': thumbnails
                }
                
        except Exception as e:
            logger.error(f"Error creating thumbnails for {input_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def optimize_image(
        self, 
        input_path: str, 
        output_path: str,
        target_size_kb: Optional[int] = None,
        quality_range: Tuple[int, int] = (60, 95)
    ) -> Dict[str, Any]:
        """
        Optimize image for web use with optional target file size
        
        Args:
            input_path: Path to input image
            output_path: Path for optimized output
            target_size_kb: Target file size in KB (optional)
            quality_range: Range of quality values to try
        
        Returns:
            Dict with optimization results
        """
        try:
            original_size = os.path.getsize(input_path)
            
            with Image.open(input_path) as img:
                # Convert to RGB if necessary for JPEG optimization
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    if img.mode == 'RGBA':
                        background.paste(img, mask=img.split()[-1])
                    else:
                        background.paste(img)
                    img = background
                
                # If target size is specified, try different quality levels
                if target_size_kb:
                    target_size_bytes = target_size_kb * 1024
                    best_quality = quality_range[0]
                    best_size = float('inf')
                    
                    for quality in range(quality_range[0], quality_range[1] + 1, 5):
                        temp_path = output_path + f"_temp_{quality}.jpg"
                        img.save(temp_path, 'JPEG', quality=quality, optimize=True, progressive=True)
                        
                        temp_size = os.path.getsize(temp_path)
                        
                        if temp_size <= target_size_bytes and temp_size < best_size:
                            best_size = temp_size
                            best_quality = quality
                            os.rename(temp_path, output_path)
                        else:
                            os.remove(temp_path)
                        
                        if temp_size <= target_size_bytes:
                            break
                    
                    final_size = os.path.getsize(output_path)
                    
                    return {
                        'success': True,
                        'original_size_bytes': original_size,
                        'optimized_size_bytes': final_size,
                        'compression_ratio': final_size / original_size,
                        'quality_used': best_quality,
                        'target_size_kb': target_size_kb,
                        'size_reduction_percent': ((original_size - final_size) / original_size) * 100
                    }
                
                else:
                    # Standard optimization with high quality
                    img.save(output_path, 'JPEG', quality=85, optimize=True, progressive=True)
                    optimized_size = os.path.getsize(output_path)
                    
                    return {
                        'success': True,
                        'original_size_bytes': original_size,
                        'optimized_size_bytes': optimized_size,
                        'compression_ratio': optimized_size / original_size,
                        'quality_used': 85,
                        'size_reduction_percent': ((original_size - optimized_size) / original_size) * 100
                    }
                
        except Exception as e:
            logger.error(f"Error optimizing image {input_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def is_supported_format(self, file_path: str, input_or_output: str = 'input') -> bool:
        """Check if file format is supported"""
        ext = Path(file_path).suffix.lower()
        supported = self.SUPPORTED_FORMATS.get(input_or_output, [])
        return ext in supported
    
    def get_image_info(self, image_path: str) -> Dict[str, Any]:
        """Get basic image information"""
        try:
            with Image.open(image_path) as img:
                return {
                    'format': img.format,
                    'mode': img.mode,
                    'size': img.size,
                    'has_transparency': img.mode in ('RGBA', 'LA') or 'transparency' in img.info,
                    'file_size_bytes': os.path.getsize(image_path)
                }
        except Exception as e:
            logger.error(f"Error getting image info for {image_path}: {str(e)}")
            return {'error': str(e)}
