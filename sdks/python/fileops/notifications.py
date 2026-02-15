"""
Notifications Client
"""

from typing import Optional
from datetime import datetime
import httpx
from .types import Notification, NotificationPreferences, PaginatedResponse


class NotificationsClient:
    """Notifications management client."""

    def __init__(self, http: httpx.Client):
        self._http = http

    def list(
        self,
        unread_only: bool = False,
        type: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> PaginatedResponse:
        """List notifications."""
        params = {"page": page, "limit": limit, "unreadOnly": unread_only}
        if type:
            params["type"] = type

        response = self._http.get("/notifications", params=params)
        response.raise_for_status()
        data = response.json()
        return PaginatedResponse(
            data=[self._parse_notification(n) for n in data["data"]],
            page=data["pagination"]["page"],
            limit=data["pagination"]["limit"],
            total=data["pagination"]["total"],
            total_pages=data["pagination"]["totalPages"],
            has_next=data["pagination"]["hasNext"],
            has_prev=data["pagination"]["hasPrev"],
        )

    def get(self, notification_id: str) -> Notification:
        """Get notification by ID."""
        response = self._http.get(f"/notifications/{notification_id}")
        response.raise_for_status()
        return self._parse_notification(response.json())

    def mark_as_read(self, notification_id: str) -> None:
        """Mark notification as read."""
        response = self._http.post(f"/notifications/{notification_id}/read")
        response.raise_for_status()

    def mark_all_as_read(self) -> None:
        """Mark all notifications as read."""
        response = self._http.post("/notifications/read-all")
        response.raise_for_status()

    def delete(self, notification_id: str) -> None:
        """Delete notification."""
        response = self._http.delete(f"/notifications/{notification_id}")
        response.raise_for_status()

    def delete_all(self) -> None:
        """Delete all notifications."""
        response = self._http.delete("/notifications")
        response.raise_for_status()

    def get_unread_count(self) -> int:
        """Get unread notification count."""
        response = self._http.get("/notifications/unread-count")
        response.raise_for_status()
        return response.json()["count"]

    def get_preferences(self) -> NotificationPreferences:
        """Get notification preferences."""
        response = self._http.get("/notifications/preferences")
        response.raise_for_status()
        data = response.json()
        return NotificationPreferences(
            email=data["email"],
            push=data["push"],
            in_app=data["inApp"],
            types=data.get("types", {}),
        )

    def update_preferences(
        self,
        email: Optional[bool] = None,
        push: Optional[bool] = None,
        in_app: Optional[bool] = None,
        types: Optional[dict] = None,
    ) -> NotificationPreferences:
        """Update notification preferences."""
        payload = {}
        if email is not None:
            payload["email"] = email
        if push is not None:
            payload["push"] = push
        if in_app is not None:
            payload["inApp"] = in_app
        if types is not None:
            payload["types"] = types

        response = self._http.put("/notifications/preferences", json=payload)
        response.raise_for_status()
        data = response.json()
        return NotificationPreferences(
            email=data["email"],
            push=data["push"],
            in_app=data["inApp"],
            types=data.get("types", {}),
        )

    def _parse_notification(self, data: dict) -> Notification:
        return Notification(
            id=data["id"],
            type=data["type"],
            title=data["title"],
            message=data["message"],
            read=data["read"],
            data=data.get("data"),
            created_at=datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00"))
            if data.get("createdAt")
            else None,
        )
