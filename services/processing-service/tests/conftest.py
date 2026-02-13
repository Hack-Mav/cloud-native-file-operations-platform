import pytest
import tempfile
import os
from pathlib import Path
from unittest.mock import Mock, AsyncMock
import asyncio

from services.processing_service.config import Settings
from services.processing_service.services.processing_service import ProcessingService
from services.processing_service.services.job_manager import JobManager
from services.processing_service.services.batch_processor import BatchProcessor
from services.processing_service.database.datastore import DatastoreClient

@pytest.fixture
def temp_dir():
    """Create a temporary directory for tests"""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield Path(temp_dir)

@pytest.fixture
def test_settings():
    """Create test settings"""
    return Settings(
        environment="testing",
        google_cloud_project="test-project",
        temp_dir="/tmp/test-processing",
        redis_url="redis://localhost:6379/1",
        max_concurrent_jobs=2,
        min_workers=1,
        max_workers=3
    )

@pytest.fixture
def mock_datastore_client():
    """Create a mock datastore client"""
    client = Mock(spec=DatastoreClient)
    client.save_job = AsyncMock(return_value=True)
    client.get_job = AsyncMock(return_value=None)
    client.query_jobs = AsyncMock(return_value=[])
    client.delete_job = AsyncMock(return_value=True)
    client.close = AsyncMock()
    return client

@pytest.fixture
def processing_service(test_settings, temp_dir):
    """Create processing service instance"""
    test_settings.temp_dir = str(temp_dir)
    return ProcessingService(test_settings)

@pytest.fixture
def job_manager(test_settings, mock_datastore_client):
    """Create job manager instance"""
    return JobManager(mock_datastore_client, test_settings.redis_url)

@pytest.fixture
def batch_processor(job_manager, processing_service):
    """Create batch processor instance"""
    return BatchProcessor(job_manager, processing_service)

@pytest.fixture
def sample_image_file(temp_dir):
    """Create a sample image file for testing"""
    from PIL import Image
    
    image_path = temp_dir / "test_image.jpg"
    img = Image.new('RGB', (100, 100), color='red')
    img.save(image_path)
    
    return image_path

@pytest.fixture
def sample_text_file(temp_dir):
    """Create a sample text file for testing"""
    text_path = temp_dir / "test_document.txt"
    with open(text_path, 'w') as f:
        f.write("This is a test document for processing.\nIt contains multiple lines.\nAnd some test content.")
    
    return text_path

@pytest.fixture
def sample_pdf_file(temp_dir):
    """Create a sample PDF file for testing"""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    
    pdf_path = temp_dir / "test_document.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    c.drawString(100, 750, "Test PDF Document")
    c.drawString(100, 730, "This is a test PDF for processing.")
    c.save()
    
    return pdf_path

@pytest.fixture
def event_loop():
    """Create an event loop for async tests"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
async def initialized_job_manager(job_manager, processing_service):
    """Initialize job manager with processing service"""
    await job_manager.initialize(processing_service)
    yield job_manager
    await job_manager.close()
