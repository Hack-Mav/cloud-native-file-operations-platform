import os
import tempfile
import subprocess
import json
from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path
import logging
import asyncio
from PIL import Image as PILImage
import cv2
import numpy as np

logger = logging.getLogger(__name__)

class VideoProcessor:
    """Handles video processing operations including thumbnail generation and compression"""
    
    SUPPORTED_FORMATS = {
        'input': ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.3gp'],
        'output': ['.mp4', '.webm', '.avi', '.mov']
    }
    
    def __init__(self, temp_dir: str = "/tmp/processing"):
        self.temp_dir = Path(temp_dir)
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.ffmpeg_path = self._find_ffmpeg()
    
    def _find_ffmpeg(self) -> str:
        """Find FFmpeg executable"""
        try:
            # Try common FFmpeg paths
            common_paths = [
                'ffmpeg',
                '/usr/bin/ffmpeg',
                '/usr/local/bin/ffmpeg',
                '/opt/homebrew/bin/ffmpeg'
            ]
            
            for path in common_paths:
                try:
                    result = subprocess.run([path, '-version'], 
                                          capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        return path
                except (subprocess.TimeoutExpired, FileNotFoundError):
                    continue
            
            logger.warning("FFmpeg not found. Video processing will be limited.")
            return None
            
        except Exception as e:
            logger.error(f"Error finding FFmpeg: {str(e)}")
            return None
    
    async def get_video_info(self, video_path: str) -> Dict[str, Any]:
        """
        Get detailed video information using FFprobe
        
        Args:
            video_path: Path to video file
        
        Returns:
            Dict with video metadata
        """
        try:
            if not self.ffmpeg_path:
                return self._get_basic_video_info(video_path)
            
            # Use ffprobe to get detailed information
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                video_path
            ]
            
            result = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode != 0:
                logger.error(f"FFprobe error: {stderr.decode()}")
                return self._get_basic_video_info(video_path)
            
            probe_data = json.loads(stdout.decode())
            
            # Extract video stream information
            video_stream = None
            audio_stream = None
            
            for stream in probe_data.get('streams', []):
                if stream['codec_type'] == 'video' and not video_stream:
                    video_stream = stream
                elif stream['codec_type'] == 'audio' and not audio_stream:
                    audio_stream = stream
            
            format_info = probe_data.get('format', {})
            
            info = {
                'file_size_bytes': int(format_info.get('size', 0)),
                'duration': float(format_info.get('duration', 0)),
                'format_name': format_info.get('format_name', ''),
                'bit_rate': int(format_info.get('bit_rate', 0)),
            }
            
            if video_stream:
                info.update({
                    'width': video_stream.get('width'),
                    'height': video_stream.get('height'),
                    'video_codec': video_stream.get('codec_name'),
                    'video_bit_rate': int(video_stream.get('bit_rate', 0)),
                    'frame_rate': self._parse_frame_rate(video_stream.get('r_frame_rate', '0/1')),
                    'pixel_format': video_stream.get('pix_fmt', ''),
                    'frame_count': int(video_stream.get('nb_frames', 0)),
                    'aspect_ratio': video_stream.get('display_aspect_ratio', ''),
                })
            
            if audio_stream:
                info.update({
                    'audio_codec': audio_stream.get('codec_name'),
                    'audio_bit_rate': int(audio_stream.get('bit_rate', 0)),
                    'sample_rate': int(audio_stream.get('sample_rate', 0)),
                    'channels': audio_stream.get('channels', 0),
                    'audio_duration': float(audio_stream.get('duration', 0)),
                })
            
            return {
                'success': True,
                'info': info
            }
            
        except Exception as e:
            logger.error(f"Error getting video info for {video_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _get_basic_video_info(self, video_path: str) -> Dict[str, Any]:
        """Get basic video info using OpenCV as fallback"""
        try:
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                return {
                    'success': False,
                    'error': 'Could not open video file'
                }
            
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = frame_count / fps if fps > 0 else 0
            
            cap.release()
            
            file_size = os.path.getsize(video_path)
            
            return {
                'success': True,
                'info': {
                    'width': width,
                    'height': height,
                    'frame_rate': fps,
                    'frame_count': frame_count,
                    'duration': duration,
                    'file_size_bytes': file_size,
                    'method': 'opencv_fallback'
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def _parse_frame_rate(self, frame_rate_str: str) -> float:
        """Parse frame rate string like '30/1' to float"""
        try:
            if '/' in frame_rate_str:
                num, denom = frame_rate_str.split('/')
                return float(num) / float(denom)
            return float(frame_rate_str)
        except:
            return 0.0
    
    async def generate_thumbnail(
        self,
        video_path: str,
        output_path: str,
        timestamp: Optional[float] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        quality: int = 85
    ) -> Dict[str, Any]:
        """
        Generate thumbnail from video
        
        Args:
            video_path: Path to video file
            output_path: Path for thumbnail output
            timestamp: Timestamp in seconds (default: 10% of video duration)
            width: Thumbnail width (default: original width)
            height: Thumbnail height (default: original height)
            quality: JPEG quality (1-100)
        
        Returns:
            Dict with thumbnail generation results
        """
        try:
            # Get video info to determine timestamp if not provided
            if timestamp is None:
                video_info = await self.get_video_info(video_path)
                if video_info['success']:
                    duration = video_info['info'].get('duration', 0)
                    timestamp = min(duration * 0.1, 5.0)  # 10% or max 5 seconds
                else:
                    timestamp = 1.0  # Default to 1 second
            
            if self.ffmpeg_path:
                return await self._generate_thumbnail_ffmpeg(
                    video_path, output_path, timestamp, width, height, quality
                )
            else:
                return await self._generate_thumbnail_opencv(
                    video_path, output_path, timestamp, width, height, quality
                )
                
        except Exception as e:
            logger.error(f"Error generating thumbnail for {video_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _generate_thumbnail_ffmpeg(
        self,
        video_path: str,
        output_path: str,
        timestamp: float,
        width: Optional[int],
        height: Optional[int],
        quality: int
    ) -> Dict[str, Any]:
        """Generate thumbnail using FFmpeg"""
        try:
            cmd = [
                'ffmpeg',
                '-i', video_path,
                '-ss', str(timestamp),
                '-vframes', '1',
                '-q:v', str(quality),
            ]
            
            # Add size constraints if specified
            if width or height:
                if width and height:
                    cmd.extend(['-s', f'{width}x{height}'])
                elif width:
                    cmd.extend(['-vf', f'scale={width}:-1'])
                elif height:
                    cmd.extend(['-vf', f'scale=-1:{height}'])
            
            cmd.append(output_path)
            
            result = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode != 0:
                logger.error(f"FFmpeg thumbnail error: {stderr.decode()}")
                return {
                    'success': False,
                    'error': f'FFmpeg failed: {stderr.decode()}'
                }
            
            # Verify thumbnail was created
            if not os.path.exists(output_path):
                return {
                    'success': False,
                    'error': 'Thumbnail file was not created'
                }
            
            # Get thumbnail info
            with PILImage.open(output_path) as img:
                thumbnail_size = img.size
            
            file_size = os.path.getsize(output_path)
            
            return {
                'success': True,
                'output_path': output_path,
                'timestamp': timestamp,
                'thumbnail_size': thumbnail_size,
                'file_size_bytes': file_size,
                'quality': quality
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _generate_thumbnail_opencv(
        self,
        video_path: str,
        output_path: str,
        timestamp: float,
        width: Optional[int],
        height: Optional[int],
        quality: int
    ) -> Dict[str, Any]:
        """Generate thumbnail using OpenCV as fallback"""
        try:
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                return {
                    'success': False,
                    'error': 'Could not open video file'
                }
            
            # Get video properties
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            # Calculate frame number from timestamp
            frame_number = min(int(timestamp * fps), total_frames - 1)
            
            # Seek to frame
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            
            # Read frame
            ret, frame = cap.read()
            
            if not ret:
                cap.release()
                return {
                    'success': False,
                    'error': 'Could not read frame from video'
                }
            
            # Resize if specified
            if width or height:
                if width and height:
                    frame = cv2.resize(frame, (width, height))
                elif width:
                    height = int(frame.shape[0] * (width / frame.shape[1]))
                    frame = cv2.resize(frame, (width, height))
                elif height:
                    width = int(frame.shape[1] * (height / frame.shape[0]))
                    frame = cv2.resize(frame, (width, height))
            
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Save as PIL Image
            pil_img = PILImage.fromarray(frame_rgb)
            pil_img.save(output_path, 'JPEG', quality=quality)
            
            cap.release()
            
            file_size = os.path.getsize(output_path)
            
            return {
                'success': True,
                'output_path': output_path,
                'timestamp': timestamp,
                'frame_number': frame_number,
                'thumbnail_size': pil_img.size,
                'file_size_bytes': file_size,
                'quality': quality,
                'method': 'opencv'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    async def generate_multiple_thumbnails(
        self,
        video_path: str,
        output_dir: str,
        count: int = 5,
        width: Optional[int] = None,
        height: Optional[int] = None,
        quality: int = 85
    ) -> Dict[str, Any]:
        """
        Generate multiple thumbnails at different timestamps
        
        Args:
            video_path: Path to video file
            output_dir: Directory to save thumbnails
            count: Number of thumbnails to generate
            width: Thumbnail width
            height: Thumbnail height
            quality: JPEG quality
        
        Returns:
            Dict with multiple thumbnail results
        """
        try:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # Get video duration
            video_info = await self.get_video_info(video_path)
            if not video_info['success']:
                return {
                    'success': False,
                    'error': 'Could not get video information'
                }
            
            duration = video_info['info'].get('duration', 0)
            if duration <= 0:
                return {
                    'success': False,
                    'error': 'Invalid video duration'
                }
            
            # Generate timestamps
            timestamps = [duration * (i + 1) / (count + 1) for i in range(count)]
            
            thumbnails = []
            base_name = Path(video_path).stem
            
            for i, timestamp in enumerate(timestamps):
                thumbnail_path = output_dir / f"{base_name}_thumb_{i+1:03d}.jpg"
                
                result = await self.generate_thumbnail(
                    video_path, str(thumbnail_path), timestamp, width, height, quality
                )
                
                if result['success']:
                    thumbnails.append({
                        'index': i + 1,
                        'timestamp': timestamp,
                        'path': str(thumbnail_path),
                        'size': result.get('thumbnail_size'),
                        'file_size_bytes': result.get('file_size_bytes', 0)
                    })
                else:
                    logger.warning(f"Failed to generate thumbnail {i+1}: {result.get('error')}")
            
            return {
                'success': True,
                'thumbnails_generated': len(thumbnails),
                'thumbnails': thumbnails,
                'video_duration': duration
            }
            
        except Exception as e:
            logger.error(f"Error generating multiple thumbnails for {video_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def compress_video(
        self,
        video_path: str,
        output_path: str,
        target_quality: Optional[str] = None,
        target_bitrate: Optional[str] = None,
        target_size_mb: Optional[float] = None,
        resolution: Optional[Tuple[int, int]] = None,
        preset: str = 'medium'
    ) -> Dict[str, Any]:
        """
        Compress video using various parameters
        
        Args:
            video_path: Path to input video
            output_path: Path for compressed output
            target_quality: Quality preset (low, medium, high)
            target_bitrate: Target bitrate (e.g., '1M', '500k')
            target_size_mb: Target file size in MB
            resolution: Target resolution (width, height)
            preset: Encoding preset (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow)
        
        Returns:
            Dict with compression results
        """
        try:
            if not self.ffmpeg_path:
                return {
                    'success': False,
                    'error': 'FFmpeg is required for video compression'
                }
            
            # Get original video info
            video_info = await self.get_video_info(video_path)
            if not video_info['success']:
                return {
                    'success': False,
                    'error': 'Could not get video information'
                }
            
            original_size = video_info['info'].get('file_size_bytes', 0)
            original_duration = video_info['info'].get('duration', 1)
            
            # Calculate target bitrate if target size is specified
            if target_size_mb and not target_bitrate:
                target_size_bytes = target_size_mb * 1024 * 1024
                target_bitrate_bits = (target_size_bytes * 8) / original_duration
                target_bitrate = f"{int(target_bitrate_bits / 1000)}k"
            
            # Set quality-based parameters
            quality_params = {
                'low': {'crf': 35, 'preset': 'fast'},
                'medium': {'crf': 28, 'preset': 'medium'},
                'high': {'crf': 23, 'preset': 'slow'}
            }
            
            if target_quality and target_quality in quality_params:
                crf = quality_params[target_quality]['crf']
                preset = quality_params[target_quality]['preset']
            else:
                crf = 28  # Default medium quality
            
            # Build FFmpeg command
            cmd = [
                'ffmpeg',
                '-i', video_path,
                '-c:v', 'libx264',
                '-preset', preset,
                '-crf', str(crf),
                '-c:a', 'aac',
                '-b:a', '128k',
            ]
            
            # Add bitrate if specified
            if target_bitrate:
                cmd.extend(['-b:v', target_bitrate])
                cmd.extend(['maxrate', target_bitrate])
                cmd.extend(['bufsize', f"{int(target_bitrate[:-1]) * 2}k"])
            
            # Add resolution if specified
            if resolution:
                width, height = resolution
                cmd.extend(['-s', f'{width}x{height}'])
            
            # Add output file
            cmd.append(output_path)
            
            # Run compression
            result = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode != 0:
                logger.error(f"FFmpeg compression error: {stderr.decode()}")
                return {
                    'success': False,
                    'error': f'Compression failed: {stderr.decode()}'
                }
            
            # Get compressed video info
            compressed_info = await self.get_video_info(output_path)
            if not compressed_info['success']:
                compressed_size = os.path.getsize(output_path)
            else:
                compressed_size = compressed_info['info'].get('file_size_bytes', 0)
            
            compression_ratio = compressed_size / original_size if original_size > 0 else 1
            size_reduction_percent = ((original_size - compressed_size) / original_size) * 100
            
            return {
                'success': True,
                'output_path': output_path,
                'original_size_bytes': original_size,
                'compressed_size_bytes': compressed_size,
                'compression_ratio': compression_ratio,
                'size_reduction_percent': size_reduction_percent,
                'target_bitrate': target_bitrate,
                'target_quality': target_quality,
                'preset_used': preset,
                'crf_used': crf
            }
            
        except Exception as e:
            logger.error(f"Error compressing video {video_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def extract_frames(
        self,
        video_path: str,
        output_dir: str,
        interval_seconds: float = 1.0,
        start_time: float = 0.0,
        end_time: Optional[float] = None,
        width: Optional[int] = None,
        height: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Extract frames from video at regular intervals
        
        Args:
            video_path: Path to video file
            output_dir: Directory to save frames
            interval_seconds: Interval between frames in seconds
            start_time: Start time in seconds
            end_time: End time in seconds (None for video end)
            width: Frame width
            height: Frame height
        
        Returns:
            Dict with frame extraction results
        """
        try:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # Get video info
            video_info = await self.get_video_info(video_path)
            if not video_info['success']:
                return {
                    'success': False,
                    'error': 'Could not get video information'
                }
            
            duration = video_info['info'].get('duration', 0)
            fps = video_info['info'].get('frame_rate', 30)
            
            if end_time is None:
                end_time = duration
            
            # Calculate frame timestamps
            timestamps = []
            current_time = start_time
            while current_time <= end_time:
                timestamps.append(current_time)
                current_time += interval_seconds
            
            frames = []
            base_name = Path(video_path).stem
            
            for i, timestamp in enumerate(timestamps):
                frame_path = output_dir / f"{base_name}_frame_{i+1:04d}.jpg"
                
                result = await self.generate_thumbnail(
                    video_path, str(frame_path), timestamp, width, height, 95
                )
                
                if result['success']:
                    frames.append({
                        'index': i + 1,
                        'timestamp': timestamp,
                        'path': str(frame_path),
                        'size': result.get('thumbnail_size'),
                        'file_size_bytes': result.get('file_size_bytes', 0)
                    })
                else:
                    logger.warning(f"Failed to extract frame at {timestamp}: {result.get('error')}")
            
            return {
                'success': True,
                'frames_extracted': len(frames),
                'frames': frames,
                'extraction_interval': interval_seconds,
                'time_range': (start_time, end_time),
                'video_duration': duration
            }
            
        except Exception as e:
            logger.error(f"Error extracting frames from {video_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def is_supported_format(self, file_path: str, input_or_output: str = 'input') -> bool:
        """Check if video format is supported"""
        ext = Path(file_path).suffix.lower()
        supported = self.SUPPORTED_FORMATS.get(input_or_output, [])
        return ext in supported
