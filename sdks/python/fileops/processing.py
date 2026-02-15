"""
Processing Client
"""

from typing import Optional, Dict, Any
from datetime import datetime
import time
import httpx
from .types import ProcessingJob, ProcessingType, JobStatus, PaginatedResponse


class ProcessingClient:
    """File processing and job management client."""

    def __init__(self, http: httpx.Client):
        self._http = http

    def create_job(
        self,
        file_id: str,
        type: str,
        options: Optional[Dict[str, Any]] = None,
        priority: str = "normal",
        webhook_url: Optional[str] = None,
    ) -> ProcessingJob:
        """Create a processing job."""
        payload = {"fileId": file_id, "type": type, "priority": priority}
        if options:
            payload["options"] = options
        if webhook_url:
            payload["webhookUrl"] = webhook_url

        response = self._http.post("/processing/jobs", json=payload)
        response.raise_for_status()
        return self._parse_job(response.json())

    def get_job(self, job_id: str) -> ProcessingJob:
        """Get job by ID."""
        response = self._http.get(f"/processing/jobs/{job_id}")
        response.raise_for_status()
        return self._parse_job(response.json())

    def list_jobs(
        self,
        status: Optional[str] = None,
        type: Optional[str] = None,
        file_id: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> PaginatedResponse:
        """List processing jobs."""
        params = {"page": page, "limit": limit}
        if status:
            params["status"] = status
        if type:
            params["type"] = type
        if file_id:
            params["fileId"] = file_id

        response = self._http.get("/processing/jobs", params=params)
        response.raise_for_status()
        data = response.json()
        return PaginatedResponse(
            data=[self._parse_job(j) for j in data["data"]],
            page=data["pagination"]["page"],
            limit=data["pagination"]["limit"],
            total=data["pagination"]["total"],
            total_pages=data["pagination"]["totalPages"],
            has_next=data["pagination"]["hasNext"],
            has_prev=data["pagination"]["hasPrev"],
        )

    def cancel_job(self, job_id: str) -> ProcessingJob:
        """Cancel a job."""
        response = self._http.delete(f"/processing/jobs/{job_id}")
        response.raise_for_status()
        return self._parse_job(response.json())

    def wait_for_completion(
        self,
        job_id: str,
        poll_interval: float = 1.0,
        timeout: float = 300.0,
        on_progress: Optional[callable] = None,
    ) -> ProcessingJob:
        """Wait for job completion."""
        start_time = time.time()

        while True:
            job = self.get_job(job_id)

            if on_progress:
                on_progress(job)

            if job.status in ["completed", "failed", "cancelled"]:
                return job

            if time.time() - start_time > timeout:
                raise TimeoutError(f"Job {job_id} did not complete within timeout")

            time.sleep(poll_interval)

    # Convenience methods
    def resize_image(
        self,
        file_id: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        format: str = "jpeg",
        quality: int = 85,
    ) -> ProcessingJob:
        """Resize an image."""
        return self.create_job(
            file_id,
            "image_resize",
            {
                "width": width,
                "height": height,
                "format": format,
                "quality": quality,
            },
        )

    def convert_document(
        self, file_id: str, target_format: str = "pdf"
    ) -> ProcessingJob:
        """Convert document format."""
        return self.create_job(
            file_id, "document_convert", {"targetFormat": target_format}
        )

    def scan_for_viruses(self, file_id: str) -> ProcessingJob:
        """Scan file for viruses."""
        return self.create_job(file_id, "virus_scan", priority="high")

    def analyze_content(self, file_id: str) -> ProcessingJob:
        """Analyze file content."""
        return self.create_job(file_id, "content_analysis")

    def _parse_job(self, data: dict) -> ProcessingJob:
        return ProcessingJob(
            id=data["id"],
            type=data["type"],
            status=data["status"],
            file_id=data["fileId"],
            progress=data["progress"],
            result=data.get("result"),
            error=data.get("error"),
            created_at=datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00"))
            if data.get("createdAt")
            else None,
            completed_at=datetime.fromisoformat(
                data["completedAt"].replace("Z", "+00:00")
            )
            if data.get("completedAt")
            else None,
        )
