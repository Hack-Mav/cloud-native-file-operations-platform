"""
Files Client
"""

from typing import Optional, Dict, Any, BinaryIO
from datetime import datetime
import httpx
from .types import File, Folder, FileVersion, PaginatedResponse


class FilesClient:
    """Files and folders management client."""

    def __init__(self, http: httpx.Client):
        self._http = http

    def list(
        self,
        folder_id: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        sort: Optional[str] = None,
        order: str = "asc",
    ) -> PaginatedResponse:
        """List files."""
        params = {"page": page, "limit": limit, "order": order}
        if folder_id:
            params["folderId"] = folder_id
        if sort:
            params["sort"] = sort

        response = self._http.get("/files", params=params)
        response.raise_for_status()
        return self._parse_paginated_response(response.json())

    def get(self, file_id: str) -> File:
        """Get file by ID."""
        response = self._http.get(f"/files/{file_id}")
        response.raise_for_status()
        return self._parse_file(response.json())

    def upload(
        self,
        file: BinaryIO,
        filename: str,
        mime_type: Optional[str] = None,
        folder_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> File:
        """Upload a file."""
        # Initialize upload
        init_response = self._http.post(
            "/files/upload",
            json={
                "filename": filename,
                "size": 0,  # Will be set by content
                "mimeType": mime_type or "application/octet-stream",
                "folderId": folder_id,
                "metadata": metadata or {},
            },
        )
        init_response.raise_for_status()
        upload_data = init_response.json()

        # Upload content
        files = {"file": (filename, file, mime_type or "application/octet-stream")}
        upload_response = httpx.put(
            upload_data["uploadUrl"],
            content=file.read(),
            headers={"Content-Type": mime_type or "application/octet-stream"},
        )
        upload_response.raise_for_status()

        # Complete upload
        complete_response = self._http.post(
            f"/files/upload/{upload_data['uploadId']}/complete"
        )
        complete_response.raise_for_status()
        return self._parse_file(complete_response.json())

    def download_url(self, file_id: str, version: Optional[int] = None) -> str:
        """Get download URL."""
        params = {}
        if version:
            params["version"] = version

        response = self._http.get(f"/files/{file_id}/download", params=params)
        response.raise_for_status()
        return response.json()["downloadUrl"]

    def update(
        self,
        file_id: str,
        name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> File:
        """Update file metadata."""
        payload = {}
        if name:
            payload["name"] = name
        if metadata:
            payload["metadata"] = metadata

        response = self._http.patch(f"/files/{file_id}", json=payload)
        response.raise_for_status()
        return self._parse_file(response.json())

    def delete(self, file_id: str) -> None:
        """Delete file."""
        response = self._http.delete(f"/files/{file_id}")
        response.raise_for_status()

    def get_versions(self, file_id: str) -> list:
        """Get file versions."""
        response = self._http.get(f"/files/{file_id}/versions")
        response.raise_for_status()
        return [self._parse_version(v) for v in response.json()]

    # Folder operations
    def list_folders(self, parent_id: Optional[str] = None) -> list:
        """List folders."""
        params = {}
        if parent_id:
            params["parentId"] = parent_id

        response = self._http.get("/folders", params=params)
        response.raise_for_status()
        return [self._parse_folder(f) for f in response.json()]

    def create_folder(self, name: str, parent_id: Optional[str] = None) -> Folder:
        """Create folder."""
        response = self._http.post(
            "/folders", json={"name": name, "parentId": parent_id}
        )
        response.raise_for_status()
        return self._parse_folder(response.json())

    def delete_folder(self, folder_id: str, recursive: bool = False) -> None:
        """Delete folder."""
        response = self._http.delete(
            f"/folders/{folder_id}", params={"recursive": recursive}
        )
        response.raise_for_status()

    def _parse_file(self, data: dict) -> File:
        return File(
            id=data["id"],
            name=data["name"],
            path=data["path"],
            mime_type=data["mimeType"],
            size=data["size"],
            checksum=data["checksum"],
            version=data["version"],
            status=data["status"],
            metadata=data.get("metadata", {}),
            created_by=data["createdBy"],
            created_at=datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(data["updatedAt"].replace("Z", "+00:00")),
        )

    def _parse_folder(self, data: dict) -> Folder:
        return Folder(
            id=data["id"],
            name=data["name"],
            path=data["path"],
            parent_id=data.get("parentId"),
            created_by=data["createdBy"],
            created_at=datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(data["updatedAt"].replace("Z", "+00:00")),
        )

    def _parse_version(self, data: dict) -> FileVersion:
        return FileVersion(
            version=data["version"],
            size=data["size"],
            checksum=data["checksum"],
            created_at=datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00")),
            created_by=data["createdBy"],
        )

    def _parse_paginated_response(self, data: dict) -> PaginatedResponse:
        return PaginatedResponse(
            data=[self._parse_file(f) for f in data["data"]],
            page=data["pagination"]["page"],
            limit=data["pagination"]["limit"],
            total=data["pagination"]["total"],
            total_pages=data["pagination"]["totalPages"],
            has_next=data["pagination"]["hasNext"],
            has_prev=data["pagination"]["hasPrev"],
        )
