"""
Main FileOps Client
"""

from typing import Optional
import httpx
from .auth import AuthClient
from .files import FilesClient
from .processing import ProcessingClient
from .notifications import NotificationsClient
from .types import FileOpsConfig, AuthTokens, HealthStatus


class FileOpsClient:
    """
    Main client for the FileOps API.

    Usage:
        client = FileOpsClient(base_url="https://api.fileops.example.com/v1")

        # Login
        auth_response = client.auth.login(email="user@example.com", password="password")

        # Upload file
        with open("document.pdf", "rb") as f:
            file = client.files.upload(f, filename="document.pdf")

        # Process file
        job = client.processing.create_job(file_id=file.id, type="virus_scan")
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        access_token: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.config = FileOpsConfig(
            base_url=base_url,
            api_key=api_key,
            access_token=access_token,
            timeout=timeout,
        )

        self._http = httpx.Client(
            base_url=base_url,
            timeout=timeout,
            headers=self._get_headers(),
        )

        self._tokens: Optional[AuthTokens] = None

        # Initialize sub-clients
        self.auth = AuthClient(self._http, self)
        self.files = FilesClient(self._http)
        self.processing = ProcessingClient(self._http)
        self.notifications = NotificationsClient(self._http)

    def _get_headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["X-API-Key"] = self.config.api_key
        if self.config.access_token:
            headers["Authorization"] = f"Bearer {self.config.access_token}"
        return headers

    def set_tokens(self, tokens: AuthTokens) -> None:
        """Set authentication tokens."""
        self._tokens = tokens
        self._http.headers["Authorization"] = f"Bearer {tokens.access_token}"

    def get_tokens(self) -> Optional[AuthTokens]:
        """Get current tokens."""
        return self._tokens

    def clear_auth(self) -> None:
        """Clear authentication."""
        self._tokens = None
        if "Authorization" in self._http.headers:
            del self._http.headers["Authorization"]

    def is_authenticated(self) -> bool:
        """Check if client is authenticated."""
        return self._tokens is not None

    def health(self) -> HealthStatus:
        """Get service health status."""
        response = self._http.get("/health")
        response.raise_for_status()
        return HealthStatus(**response.json())

    def ready(self) -> bool:
        """Check if service is ready."""
        try:
            response = self._http.get("/health/ready")
            return response.status_code == 200
        except Exception:
            return False

    def alive(self) -> bool:
        """Check if service is alive."""
        try:
            response = self._http.get("/health/live")
            return response.status_code == 200
        except Exception:
            return False

    def close(self) -> None:
        """Close the HTTP client."""
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
