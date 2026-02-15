"""
FileOps Python SDK
Official Python SDK for the Cloud-Native File Operations Platform
"""

from .client import FileOpsClient
from .auth import AuthClient
from .files import FilesClient
from .processing import ProcessingClient
from .notifications import NotificationsClient
from .errors import (
    FileOpsError,
    AuthenticationError,
    AuthorizationError,
    ValidationError,
    NotFoundError,
    RateLimitError,
)

__version__ = "1.0.0"
__all__ = [
    "FileOpsClient",
    "AuthClient",
    "FilesClient",
    "ProcessingClient",
    "NotificationsClient",
    "FileOpsError",
    "AuthenticationError",
    "AuthorizationError",
    "ValidationError",
    "NotFoundError",
    "RateLimitError",
]
