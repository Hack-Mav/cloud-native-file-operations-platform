"""
Authentication Client
"""

from typing import Optional, List
from datetime import datetime
import httpx
from .types import User, AuthTokens, AuthResponse


class AuthClient:
    """Authentication and user management client."""

    def __init__(self, http: httpx.Client, parent):
        self._http = http
        self._parent = parent

    def register(self, email: str, password: str, name: str) -> AuthResponse:
        """Register a new user."""
        response = self._http.post(
            "/auth/register",
            json={"email": email, "password": password, "name": name},
        )
        response.raise_for_status()
        data = response.json()

        auth_response = self._parse_auth_response(data)
        self._parent.set_tokens(self._to_tokens(data))
        return auth_response

    def login(
        self, email: str, password: str, mfa_code: Optional[str] = None
    ) -> AuthResponse:
        """Login with email and password."""
        payload = {"email": email, "password": password}
        if mfa_code:
            payload["mfaCode"] = mfa_code

        response = self._http.post("/auth/login", json=payload)
        response.raise_for_status()
        data = response.json()

        auth_response = self._parse_auth_response(data)
        self._parent.set_tokens(self._to_tokens(data))
        return auth_response

    def refresh(self, refresh_token: Optional[str] = None) -> AuthTokens:
        """Refresh access token."""
        token = refresh_token or (
            self._parent.get_tokens().refresh_token if self._parent.get_tokens() else None
        )
        if not token:
            raise ValueError("No refresh token available")

        response = self._http.post("/auth/refresh", json={"refreshToken": token})
        response.raise_for_status()
        data = response.json()

        tokens = self._to_tokens(data)
        self._parent.set_tokens(tokens)
        return tokens

    def logout(self) -> None:
        """Logout current user."""
        self._http.post("/auth/logout")
        self._parent.clear_auth()

    def get_profile(self) -> User:
        """Get current user profile."""
        response = self._http.get("/auth/profile")
        response.raise_for_status()
        return self._parse_user(response.json())

    def update_profile(self, name: Optional[str] = None) -> User:
        """Update current user profile."""
        response = self._http.put("/auth/profile", json={"name": name})
        response.raise_for_status()
        return self._parse_user(response.json())

    def change_password(self, current_password: str, new_password: str) -> None:
        """Change password."""
        response = self._http.post(
            "/auth/change-password",
            json={"currentPassword": current_password, "newPassword": new_password},
        )
        response.raise_for_status()

    def setup_mfa(self) -> dict:
        """Setup MFA (get secret and QR code)."""
        response = self._http.post("/auth/mfa/setup")
        response.raise_for_status()
        return response.json()

    def verify_mfa(self, code: str) -> dict:
        """Verify MFA setup with code."""
        response = self._http.post("/auth/mfa/verify", json={"code": code})
        response.raise_for_status()
        return response.json()

    def disable_mfa(self, code: str) -> None:
        """Disable MFA."""
        response = self._http.post("/auth/mfa/disable", json={"code": code})
        response.raise_for_status()

    def get_mfa_status(self) -> dict:
        """Get MFA status."""
        response = self._http.get("/auth/mfa/status")
        response.raise_for_status()
        return response.json()

    def _parse_auth_response(self, data: dict) -> AuthResponse:
        return AuthResponse(
            access_token=data["accessToken"],
            refresh_token=data["refreshToken"],
            token_type=data["tokenType"],
            expires_in=data["expiresIn"],
            user=self._parse_user(data["user"]),
        )

    def _parse_user(self, data: dict) -> User:
        return User(
            id=data["id"],
            email=data["email"],
            name=data["name"],
            roles=data["roles"],
            status=data["status"],
            mfa_enabled=data.get("mfaEnabled", False),
            created_at=datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(data["updatedAt"].replace("Z", "+00:00")),
        )

    def _to_tokens(self, data: dict) -> AuthTokens:
        return AuthTokens(
            access_token=data["accessToken"],
            refresh_token=data["refreshToken"],
            token_type=data["tokenType"],
            expires_in=data["expiresIn"],
            expires_at=datetime.now(),
        )
