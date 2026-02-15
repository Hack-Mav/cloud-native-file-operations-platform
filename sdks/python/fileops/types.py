"""
SDK Types and Data Classes
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"
    PROCESSOR = "processor"


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"


class FileStatus(str, Enum):
    ACTIVE = "active"
    PROCESSING = "processing"
    QUARANTINED = "quarantined"
    DELETED = "deleted"


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProcessingType(str, Enum):
    IMAGE_RESIZE = "image_resize"
    DOCUMENT_CONVERT = "document_convert"
    VIDEO_TRANSCODE = "video_transcode"
    VIRUS_SCAN = "virus_scan"
    CONTENT_ANALYSIS = "content_analysis"


class NotificationType(str, Enum):
    FILE_UPLOADED = "file_uploaded"
    FILE_SHARED = "file_shared"
    PROCESSING_COMPLETE = "processing_complete"
    SYSTEM_ALERT = "system_alert"


@dataclass
class FileOpsConfig:
    base_url: str
    api_key: Optional[str] = None
    access_token: Optional[str] = None
    timeout: float = 30.0


@dataclass
class AuthTokens:
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    expires_at: datetime


@dataclass
class User:
    id: str
    email: str
    name: str
    roles: List[str]
    status: str
    mfa_enabled: bool
    created_at: datetime
    updated_at: datetime


@dataclass
class AuthResponse:
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: User


@dataclass
class File:
    id: str
    name: str
    path: str
    mime_type: str
    size: int
    checksum: str
    version: int
    status: str
    metadata: Dict[str, Any]
    created_by: str
    created_at: datetime
    updated_at: datetime


@dataclass
class Folder:
    id: str
    name: str
    path: str
    parent_id: Optional[str]
    created_by: str
    created_at: datetime
    updated_at: datetime


@dataclass
class FileVersion:
    version: int
    size: int
    checksum: str
    created_at: datetime
    created_by: str


@dataclass
class ProcessingJob:
    id: str
    type: str
    status: str
    file_id: str
    progress: int
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


@dataclass
class Notification:
    id: str
    type: str
    title: str
    message: str
    read: bool
    data: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None


@dataclass
class NotificationPreferences:
    email: bool
    push: bool
    in_app: bool
    types: Dict[str, bool] = field(default_factory=dict)


@dataclass
class HealthStatus:
    status: str
    version: str
    timestamp: Optional[datetime] = None
    services: Optional[Dict[str, Any]] = None


@dataclass
class PaginatedResponse:
    data: List[Any]
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool
