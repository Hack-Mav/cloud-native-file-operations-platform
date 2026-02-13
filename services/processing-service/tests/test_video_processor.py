import pytest
import asyncio
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock, MagicMock

from services.processing_service.services.video_processor import VideoProcessor

class TestVideoProcessor:
    """Test cases for VideoProcessor"""
    
    @pytest.fixture
    def video_processor(self, temp_dir):
        """Create video processor instance"""
        return VideoProcessor(str(temp_dir))
    
    @pytest.fixture
    def mock_video_file(self, temp_dir):
        """Create a mock video file"""
        video_path = temp_dir / "test_video.mp4"
        # Create a dummy file (in real tests, this would be an actual video)
        video_path.write_bytes(b"fake video content")
        return video_path
    
    @pytest.mark.asyncio
    async def test_get_video_info_with_ffmpeg(self, video_processor):
        """Test getting video info using FFmpeg"""
        # Mock FFprobe output
        mock_probe_data = {
            'streams': [
                {
                    'codec_type': 'video',
                    'width': 1920,
                    'height': 1080,
                    'codec_name': 'h264',
                    'bit_rate': '5000000',
                    'r_frame_rate': '30/1',
                    'pix_fmt': 'yuv420p',
                    'nb_frames': '900'
                },
                {
                    'codec_type': 'audio',
                    'codec_name': 'aac',
                    'bit_rate': '128000',
                    'sample_rate': '44100',
                    'channels': 2
                }
            ],
            'format': {
                'size': '50000000',
                'duration': '30.0',
                'format_name': 'mov,mp4,m4a,3gp,3g2,mj2',
                'bit_rate': '5128000'
            }
        }
        
        with patch('asyncio.create_subprocess_exec') as mock_subprocess:
            # Mock subprocess execution
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (
                json.dumps(mock_probe_data).encode(),
                b''
            )
            mock_process.returncode = 0
            mock_subprocess.return_value = mock_process
            
            result = await video_processor.get_video_info("test.mp4")
            
            assert result['success'] is True
            info = result['info']
            
            assert info['width'] == 1920
            assert info['height'] == 1080
            assert info['video_codec'] == 'h264'
            assert info['frame_rate'] == 30.0
            assert info['duration'] == 30.0
            assert info['file_size_bytes'] == 50000000
            assert info['audio_codec'] == 'aac'
            assert info['sample_rate'] == 44100
    
    @pytest.mark.asyncio
    async def test_get_video_info_fallback_to_opencv(self, video_processor, mock_video_file):
        """Test getting video info falling back to OpenCV"""
        # Mock FFmpeg as unavailable
        video_processor.ffmpeg_path = None
        
        with patch('cv2.VideoCapture') as mock_cv:
            # Mock OpenCV video capture
            mock_cap = MagicMock()
            mock_cap.isOpened.return_value = True
            mock_cap.get.side_effect = lambda prop: {
                3: 1920,  # CAP_PROP_FRAME_WIDTH
                4: 1080,  # CAP_PROP_FRAME_HEIGHT
                5: 30.0,  # CAP_PROP_FPS
                7: 900,   # CAP_PROP_FRAME_COUNT
            }.get(prop, 0)
            mock_cv.return_value = mock_cap
            
            result = await video_processor.get_video_info(str(mock_video_file))
            
            assert result['success'] is True
            info = result['info']
            
            assert info['width'] == 1920
            assert info['height'] == 1080
            assert info['frame_rate'] == 30.0
            assert info['frame_count'] == 900
            assert info['method'] == 'opencv_fallback'
    
    @pytest.mark.asyncio
    async def test_generate_thumbnail_ffmpeg(self, video_processor, temp_dir):
        """Test thumbnail generation using FFmpeg"""
        output_path = temp_dir / "thumbnail.jpg"
        
        with patch('asyncio.create_subprocess_exec') as mock_subprocess:
            # Mock successful FFmpeg execution
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b'', b'')
            mock_process.returncode = 0
            mock_subprocess.return_value = mock_process
            
            # Mock file creation
            output_path.touch()
            
            result = await video_processor.generate_thumbnail(
                "test.mp4",
                str(output_path),
                timestamp=5.0,
                width=320,
                height=240,
                quality=85
            )
            
            assert result['success'] is True
            assert result['timestamp'] == 5.0
            assert result['quality'] == 85
    
    @pytest.mark.asyncio
    async def test_generate_thumbnail_opencv_fallback(self, video_processor, mock_video_file, temp_dir):
        """Test thumbnail generation using OpenCV fallback"""
        video_processor.ffmpeg_path = None
        output_path = temp_dir / "thumbnail.jpg"
        
        with patch('cv2.VideoCapture') as mock_cv, \
             patch('cv2.cvtColor') as mock_cvtcolor, \
             patch('PIL.Image.fromarray') as mock_pil:
            
            # Mock OpenCV operations
            mock_cap = MagicMock()
            mock_cap.isOpened.return_value = True
            mock_cap.get.side_effect = lambda prop: {
                3: 1920,  # CAP_PROP_FRAME_WIDTH
                4: 1080,  # CAP_PROP_FRAME_HEIGHT
                5: 30.0,  # CAP_PROP_FPS
                1: 150,   # CAP_PROP_POS_FRAMES (frame at 5 seconds)
            }.get(prop, 0)
            mock_cap.read.return_value = (True, MagicMock())  # Mock frame
            mock_cv.return_value = mock_cap
            
            # Mock color conversion
            mock_cvtcolor.return_value = MagicMock()
            
            # Mock PIL image
            mock_img = MagicMock()
            mock_img.size = (320, 240)
            mock_pil.return_value = mock_img
            
            result = await video_processor.generate_thumbnail(
                str(mock_video_file),
                str(output_path),
                timestamp=5.0
            )
            
            assert result['success'] is True
            assert result['method'] == 'opencv'
    
    @pytest.mark.asyncio
    async def test_generate_multiple_thumbnails(self, video_processor, temp_dir):
        """Test generating multiple thumbnails"""
        output_dir = temp_dir / "thumbnails"
        
        with patch.object(video_processor, 'generate_thumbnail') as mock_generate:
            # Mock single thumbnail generation
            mock_generate.return_value = {
                'success': True,
                'output_path': str(output_dir / "thumb_1.jpg"),
                'file_size_bytes': 1024
            }
            
            result = await video_processor.generate_multiple_thumbnails(
                "test.mp4",
                str(output_dir),
                count=3,
                width=160,
                height=120
            )
            
            assert result['success'] is True
            assert result['thumbnails_generated'] == 3
            assert len(result['thumbnails']) == 3
            
            # Verify generate_thumbnail was called 3 times
            assert mock_generate.call_count == 3
    
    @pytest.mark.asyncio
    async def test_compress_video(self, video_processor, temp_dir):
        """Test video compression"""
        input_path = temp_dir / "input.mp4"
        output_path = temp_dir / "compressed.mp4"
        
        # Create input file
        input_path.write_bytes(b"fake video content")
        
        with patch('asyncio.create_subprocess_exec') as mock_subprocess, \
             patch.object(video_processor, 'get_video_info') as mock_get_info:
            
            # Mock video info
            mock_get_info.return_value = {
                'success': True,
                'info': {
                    'file_size_bytes': 100000000,  # 100MB
                    'duration': 120.0  # 2 minutes
                }
            }
            
            # Mock FFmpeg execution
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b'', b'')
            mock_process.returncode = 0
            mock_subprocess.return_value = mock_process
            
            # Create output file
            output_path.write_bytes(b"compressed content")
            
            result = await video_processor.compress_video(
                str(input_path),
                str(output_path),
                target_quality="medium",
                target_bitrate="1M"
            )
            
            assert result['success'] is True
            assert result['original_size_bytes'] == 100000000
            assert result['target_bitrate'] == "1M"
            assert result['target_quality'] == "medium"
    
    @pytest.mark.asyncio
    async def test_compress_video_with_target_size(self, video_processor, temp_dir):
        """Test video compression with target file size"""
        input_path = temp_dir / "input.mp4"
        output_path = temp_dir / "compressed.mp4"
        
        # Create input file
        input_path.write_bytes(b"fake video content")
        output_path.write_bytes(b"compressed content")  # 50MB
        
        with patch('asyncio.create_subprocess_exec') as mock_subprocess, \
             patch.object(video_processor, 'get_video_info') as mock_get_info:
            
            # Mock video info
            mock_get_info.return_value = {
                'success': True,
                'info': {
                    'file_size_bytes': 100000000,  # 100MB
                    'duration': 120.0  # 2 minutes
                }
            }
            
            # Mock FFmpeg execution
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b'', b'')
            mock_process.returncode = 0
            mock_subprocess.return_value = mock_process
            
            result = await video_processor.compress_video(
                str(input_path),
                str(output_path),
                target_size_mb=50.0
            )
            
            assert result['success'] is True
            assert result['target_size_mb'] == 50.0
            assert result['size_reduction_percent'] == 50.0
    
    @pytest.mark.asyncio
    async def test_extract_frames(self, video_processor, temp_dir):
        """Test frame extraction"""
        output_dir = temp_dir / "frames"
        
        with patch.object(video_processor, 'generate_thumbnail') as mock_generate:
            # Mock thumbnail generation
            mock_generate.return_value = {
                'success': True,
                'output_path': str(output_dir / "frame_1.jpg"),
                'thumbnail_size': (320, 240),
                'file_size_bytes': 1024
            }
            
            result = await video_processor.extract_frames(
                "test.mp4",
                str(output_dir),
                interval_seconds=5.0,
                start_time=0.0,
                end_time=15.0
            )
            
            assert result['success'] is True
            assert result['frames_extracted'] == 3  # 0, 5, 10, 15 (but 15 is exclusive)
            assert len(result['frames']) == 3
            assert result['extraction_interval'] == 5.0
            assert result['time_range'] == (0.0, 15.0)
    
    def test_parse_frame_rate(self, video_processor):
        """Test frame rate parsing"""
        assert video_processor._parse_frame_rate("30/1") == 30.0
        assert video_processor._parse_frame_rate("29.97") == 29.97
        assert video_processor._parse_frame_rate("25/1") == 25.0
        assert video_processor._parse_frame_rate("invalid") == 0.0
        assert video_processor._parse_frame_rate("") == 0.0
    
    def test_format_duration(self, video_processor):
        """Test duration formatting"""
        assert video_processor._format_duration(125.5) == "02:05"
        assert video_processor._format_duration(65.0) == "01:05"
        assert video_processor._format_duration(30.0) == "00:30"
        assert video_processor._format_duration(0.0) == "00:00"
    
    def test_is_supported_format_input(self, video_processor):
        """Test supported input format checking"""
        assert video_processor.is_supported_format("test.mp4", "input") is True
        assert video_processor.is_supported_format("test.avi", "input") is True
        assert video_processor.is_supported_format("test.mov", "input") is True
        assert video_processor.is_supported_format("test.mkv", "input") is True
        assert video_processor.is_supported_format("test.jpg", "input") is False
        assert video_processor.is_supported_format("test.pdf", "input") is False
    
    def test_is_supported_format_output(self, video_processor):
        """Test supported output format checking"""
        assert video_processor.is_supported_format("test.mp4", "output") is True
        assert video_processor.is_supported_format("test.webm", "output") is True
        assert video_processor.is_supported_format("test.avi", "output") is True
        assert video_processor.is_supported_format("test.mov", "output") is True
        assert video_processor.is_supported_format("test.jpg", "output") is False
        assert video_processor.is_supported_format("test.txt", "output") is False
    
    @pytest.mark.asyncio
    async def test_generate_thumbnail_invalid_file(self, video_processor):
        """Test thumbnail generation with invalid file"""
        output_path = "thumbnail.jpg"
        
        result = await video_processor.generate_thumbnail(
            "nonexistent.mp4",
            output_path
        )
        
        assert result['success'] is False
        assert 'error' in result
    
    @pytest.mark.asyncio
    async def test_compress_video_no_ffmpeg(self, video_processor):
        """Test video compression without FFmpeg"""
        video_processor.ffmpeg_path = None
        
        result = await video_processor.compress_video(
            "input.mp4",
            "output.mp4"
        )
        
        assert result['success'] is False
        assert 'FFmpeg is required' in result['error']
    
    @pytest.mark.asyncio
    async def test_get_video_info_invalid_file(self, video_processor):
        """Test getting video info for invalid file"""
        result = await video_processor.get_video_info("nonexistent.mp4")
        
        assert result['success'] is False
        assert 'error' in result
    
    @pytest.mark.asyncio
    async def test_generate_thumbnail_ffmpeg_error(self, video_processor, temp_dir):
        """Test thumbnail generation with FFmpeg error"""
        output_path = temp_dir / "thumbnail.jpg"
        
        with patch('asyncio.create_subprocess_exec') as mock_subprocess:
            # Mock FFmpeg failure
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b'', b'FFmpeg error')
            mock_process.returncode = 1
            mock_subprocess.return_value = mock_process
            
            result = await video_processor.generate_thumbnail(
                "test.mp4",
                str(output_path)
            )
            
            assert result['success'] is False
            assert 'FFmpeg failed' in result['error']
    
    @pytest.mark.asyncio
    async def test_compress_video_ffmpeg_error(self, video_processor, temp_dir):
        """Test video compression with FFmpeg error"""
        input_path = temp_dir / "input.mp4"
        output_path = temp_dir / "compressed.mp4"
        
        input_path.write_bytes(b"fake video content")
        
        with patch('asyncio.create_subprocess_exec') as mock_subprocess, \
             patch.object(video_processor, 'get_video_info') as mock_get_info:
            
            # Mock video info
            mock_get_info.return_value = {
                'success': True,
                'info': {'file_size_bytes': 100000000, 'duration': 120.0}
            }
            
            # Mock FFmpeg failure
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b'', b'Compression error')
            mock_process.returncode = 1
            mock_subprocess.return_value = mock_process
            
            result = await video_processor.compress_video(
                str(input_path),
                str(output_path)
            )
            
            assert result['success'] is False
            assert 'Compression failed' in result['error']
    
    @pytest.mark.asyncio
    async def test_extract_frames_no_ffmpeg(self, video_processor, temp_dir):
        """Test frame extraction without FFmpeg"""
        video_processor.ffmpeg_path = None
        
        result = await video_processor.extract_frames(
            "test.mp4",
            str(temp_dir / "frames")
        )
        
        # Should still work with OpenCV fallback
        assert result['success'] is True
    
    @pytest.mark.asyncio
    async def test_generate_multiple_thumbnails_with_count_zero(self, video_processor, temp_dir):
        """Test generating multiple thumbnails with count=0"""
        result = await video_processor.generate_multiple_thumbnails(
            "test.mp4",
            str(temp_dir / "thumbnails"),
            count=0
        )
        
        assert result['success'] is True
        assert result['thumbnails_generated'] == 0
        assert len(result['thumbnails']) == 0
    
    @pytest.mark.asyncio
    async def test_compress_video_with_custom_preset(self, video_processor, temp_dir):
        """Test video compression with custom preset"""
        input_path = temp_dir / "input.mp4"
        output_path = temp_dir / "compressed.mp4"
        
        input_path.write_bytes(b"fake video content")
        output_path.write_bytes(b"compressed content")
        
        with patch('asyncio.create_subprocess_exec') as mock_subprocess, \
             patch.object(video_processor, 'get_video_info') as mock_get_info:
            
            mock_get_info.return_value = {
                'success': True,
                'info': {'file_size_bytes': 100000000, 'duration': 120.0}
            }
            
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b'', b'')
            mock_process.returncode = 0
            mock_subprocess.return_value = mock_process
            
            result = await video_processor.compress_video(
                str(input_path),
                str(output_path),
                preset="slow"
            )
            
            assert result['success'] is True
            assert result['preset_used'] == "slow"
