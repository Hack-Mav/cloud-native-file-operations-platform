"""
SDK Exceptions
"""

from typing import Optional, Dict, Any


class FileOpsError(Exception):
    """Base exception for FileOps SDK."""

    def __init__(
        self,
        message: str,
        code: str = "UNKNOWN_ERROR",
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        self.request_id = request_id

    def to_dict(self) -> Dict[str, Any]:
        return {
            "message": self.message,
            "code": self.code,
            "status_code": self.status_code,
            "details": self.details,
            "request_id": self.request_id,
        }


class AuthenticationError(FileOpsError):
    """Raised when authentication fails."""

    def __init__(
        self,
        message: str = "Authentication required",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, "AUTHENTICATION_ERROR", 401, details)


class AuthorizationError(FileOpsError):
    """Raised when authorization fails."""

    def __init__(
        self,
        message: str = "Permission denied",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, "AUTHORIZATION_ERROR", 403, details)


class ValidationError(FileOpsError):
    """Raised when validation fails."""

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, "VALIDATION_ERROR", 400, details)
        self.field = field


class NotFoundError(FileOpsError):
    """Raised when a resource is not found."""

    def __init__(
        self,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        message: Optional[str] = None,
    ):
        msg = message or f"{resource_type or 'Resource'} not found{f': {resource_id}' if resource_id else ''}"
        super().__init__(msg, "NOT_FOUND", 404)
        self.resource_type = resource_type
        self.resource_id = resource_id


class RateLimitError(FileOpsError):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        retry_after: Optional[int] = None,
        limit: Optional[int] = None,
        remaining: Optional[int] = None,
    ):
        super().__init__("Rate limit exceeded", "RATE_LIMITED", 429)
        self.retry_after = retry_after
        self.limit = limit
        self.remaining = remaining


class ConflictError(FileOpsError):
    """Raised when there's a resource conflict."""

    def __init__(
        self,
        message: str = "Resource conflict",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, "CONFLICT", 409, details)


class ServerError(FileOpsError):
    """Raised when there's a server error."""

    def __init__(
        self,
        message: str = "Internal server error",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, "SERVER_ERROR", 500, details)
