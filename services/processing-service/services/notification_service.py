import asyncio
import json
import smtplib
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
import httpx
from pathlib import Path

from ..models import Job, JobStatus, BatchJob
from ..config import Settings

logger = logging.getLogger(__name__)

class NotificationChannel(str, Enum):
    EMAIL = "email"
    WEBHOOK = "webhook"
    SLACK = "slack"
    SMS = "sms"
    IN_APP = "in_app"

class NotificationSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class NotificationType(str, Enum):
    JOB_FAILED = "job_failed"
    JOB_COMPLETED = "job_completed"
    BATCH_JOB_FAILED = "batch_job_failed"
    BATCH_JOB_COMPLETED = "batch_job_completed"
    SYSTEM_ALERT = "system_alert"
    DEADLetter_QUEUE_FULL = "dlq_full"
    WORKER_DOWN = "worker_down"
    RESOURCE_EXHAUSTED = "resource_exhausted"

@dataclass
class NotificationMessage:
    """Represents a notification message"""
    notification_id: str
    type: NotificationType
    severity: NotificationSeverity
    title: str
    message: str
    details: Dict[str, Any]
    channels: List[NotificationChannel]
    recipients: List[str]
    timestamp: datetime
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            'notification_id': self.notification_id,
            'type': self.type.value,
            'severity': self.severity.value,
            'title': self.title,
            'message': self.message,
            'details': self.details,
            'channels': [c.value for c in self.channels],
            'recipients': self.recipients,
            'timestamp': self.timestamp.isoformat(),
            'metadata': self.metadata
        }

class NotificationService:
    """Handles job failure notifications and system alerts"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.notification_queue = asyncio.Queue()
        self.channel_handlers: Dict[NotificationChannel, Callable] = {}
        self.notification_history: List[NotificationMessage] = []
        self.subscribers: Dict[NotificationType, List[str]] = {}
        
        # Configuration
        self.max_queue_size = settings.get('NOTIFICATION_MAX_QUEUE_SIZE', 1000)
        self.retry_attempts = settings.get('NOTIFICATION_RETRY_ATTEMPTS', 3)
        self.rate_limit_per_minute = settings.get('NOTIFICATION_RATE_LIMIT', 10)
        
        # Email configuration
        self.smtp_server = settings.get('SMTP_SERVER', 'localhost')
        self.smtp_port = settings.get('SMTP_PORT', 587)
        self.smtp_username = settings.get('SMTP_USERNAME', '')
        self.smtp_password = settings.get('SMTP_PASSWORD', '')
        self.email_from = settings.get('EMAIL_FROM', 'noreply@fileops.com')
        
        # Webhook configuration
        self.webhook_urls = settings.get('WEBHOOK_URLS', {})
        
        # Statistics
        self.stats = {
            'total_sent': 0,
            'total_failed': 0,
            'by_channel': {},
            'by_type': {},
            'by_severity': {}
        }
        
        # Register channel handlers
        self._register_channel_handlers()
        
        # Load subscribers
        self._load_subscribers()
        
        logger.info("Notification service initialized")
    
    def _register_channel_handlers(self):
        """Register handlers for different notification channels"""
        self.channel_handlers[NotificationChannel.EMAIL] = self._send_email
        self.channel_handlers[NotificationChannel.WEBHOOK] = self._send_webhook
        self.channel_handlers[NotificationChannel.SLACK] = self._send_slack
        self.channel_handlers[NotificationChannel.SMS] = self._send_sms
        self.channel_handlers[NotificationChannel.IN_APP] = self._send_in_app
    
    def _load_subscribers(self):
        """Load notification subscribers from configuration"""
        # Default subscribers for different notification types
        self.subscribers = {
            NotificationType.JOB_FAILED: ['admin@fileops.com', 'ops-team@fileops.com'],
            NotificationType.BATCH_JOB_FAILED: ['admin@fileops.com', 'ops-team@fileops.com'],
            NotificationType.SYSTEM_ALERT: ['admin@fileops.com', 'devops@fileops.com'],
            NotificationType.DEADLetter_QUEUE_FULL: ['admin@fileops.com', 'devops@fileops.com'],
            NotificationType.WORKER_DOWN: ['ops-team@fileops.com'],
            NotificationType.RESOURCE_EXHAUSTED: ['ops-team@fileops.com', 'devops@fileops.com']
        }
    
    async def notify_job_failure(
        self,
        job: Job,
        error: Exception,
        retry_count: int = 0,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Send notification for job failure"""
        try:
            # Determine severity based on retry count and error type
            if retry_count >= 3:
                severity = NotificationSeverity.CRITICAL
            elif retry_count >= 1:
                severity = NotificationSeverity.ERROR
            else:
                severity = NotificationSeverity.WARNING
            
            # Create notification message
            notification = NotificationMessage(
                notification_id=self._generate_notification_id(),
                type=NotificationType.JOB_FAILED,
                severity=severity,
                title=f"Job Failed: {job.job_id}",
                message=f"Processing job {job.job_id} for file {job.file_id} failed: {str(error)}",
                details={
                    'job_id': job.job_id,
                    'file_id': job.file_id,
                    'pipeline_id': job.pipeline_id,
                    'error_message': str(error),
                    'error_type': type(error).__name__,
                    'retry_count': retry_count,
                    'created_at': job.created_at.isoformat(),
                    'started_at': job.started_at.isoformat() if job.started_at else None,
                    'priority': job.priority.value if hasattr(job, 'priority') else 'medium'
                },
                channels=[NotificationChannel.EMAIL, NotificationChannel.WEBHOOK],
                recipients=self.subscribers.get(NotificationType.JOB_FAILED, []),
                timestamp=datetime.utcnow(),
                metadata=additional_context or {}
            )
            
            await self._send_notification(notification)
            
            logger.warning(f"Sent job failure notification for {job.job_id}")
            return notification.notification_id
            
        except Exception as e:
            logger.error(f"Error sending job failure notification: {str(e)}")
            raise
    
    async def notify_batch_job_failure(
        self,
        batch_job: BatchJob,
        error_summary: Dict[str, int],
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Send notification for batch job failure"""
        try:
            # Determine severity based on failure rate
            total_files = len(batch_job.file_ids)
            failed_files = batch_job.result.failed_files if batch_job.result else 0
            failure_rate = (failed_files / total_files) * 100 if total_files > 0 else 0
            
            if failure_rate >= 50:
                severity = NotificationSeverity.CRITICAL
            elif failure_rate >= 20:
                severity = NotificationSeverity.ERROR
            else:
                severity = NotificationSeverity.WARNING
            
            # Create notification message
            notification = NotificationMessage(
                notification_id=self._generate_notification_id(),
                type=NotificationType.BATCH_JOB_FAILED,
                severity=severity,
                title=f"Batch Job Failed: {batch_job.batch_id}",
                message=f"Batch job {batch_job.name} ({batch_job.batch_id}) failed with {failed_files}/{total_files} files",
                details={
                    'batch_id': batch_job.batch_id,
                    'batch_name': batch_job.name,
                    'total_files': total_files,
                    'failed_files': failed_files,
                    'success_rate': 100 - failure_rate,
                    'error_summary': error_summary,
                    'created_at': batch_job.created_at.isoformat(),
                    'started_at': batch_job.started_at.isoformat() if batch_job.started_at else None,
                    'priority': batch_job.priority.value if hasattr(batch_job, 'priority') else 'medium'
                },
                channels=[NotificationChannel.EMAIL, NotificationChannel.WEBHOOK],
                recipients=self.subscribers.get(NotificationType.BATCH_JOB_FAILED, []),
                timestamp=datetime.utcnow(),
                metadata=additional_context or {}
            )
            
            await self._send_notification(notification)
            
            logger.warning(f"Sent batch job failure notification for {batch_job.batch_id}")
            return notification.notification_id
            
        except Exception as e:
            logger.error(f"Error sending batch job failure notification: {str(e)}")
            raise
    
    async def notify_system_alert(
        self,
        alert_type: NotificationType,
        message: str,
        details: Dict[str, Any],
        severity: NotificationSeverity = NotificationSeverity.WARNING,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Send system alert notification"""
        try:
            notification = NotificationMessage(
                notification_id=self._generate_notification_id(),
                type=alert_type,
                severity=severity,
                title=f"System Alert: {alert_type.value}",
                message=message,
                details=details,
                channels=[NotificationChannel.EMAIL, NotificationChannel.WEBHOOK, NotificationChannel.SLACK],
                recipients=self.subscribers.get(alert_type, ['admin@fileops.com']),
                timestamp=datetime.utcnow(),
                metadata=additional_context or {}
            )
            
            await self._send_notification(notification)
            
            logger.warning(f"Sent system alert: {alert_type.value}")
            return notification.notification_id
            
        except Exception as e:
            logger.error(f"Error sending system alert: {str(e)}")
            raise
    
    async def notify_dead_letter_queue_full(self, queue_size: int, max_size: int) -> str:
        """Send notification when dead letter queue is full"""
        return await self.notify_system_alert(
            NotificationType.DEADLetter_QUEUE_FULL,
            f"Dead letter queue is full ({queue_size}/{max_size})",
            {
                'current_size': queue_size,
                'max_size': max_size,
                'utilization': (queue_size / max_size) * 100
            },
            NotificationSeverity.CRITICAL
        )
    
    async def notify_worker_down(self, worker_id: str, last_heartbeat: datetime) -> str:
        """Send notification when a worker goes down"""
        return await self.notify_system_alert(
            NotificationType.WORKER_DOWN,
            f"Worker {worker_id} is down",
            {
                'worker_id': worker_id,
                'last_heartbeat': last_heartbeat.isoformat(),
                'downtime_minutes': (datetime.utcnow() - last_heartbeat).total_seconds() / 60
            },
            NotificationSeverity.ERROR
        )
    
    async def notify_resource_exhausted(
        self, 
        resource_type: str, 
        current_usage: float, 
        threshold: float
    ) -> str:
        """Send notification when resources are exhausted"""
        return await self.notify_system_alert(
            NotificationType.RESOURCE_EXHAUSTED,
            f"{resource_type} resource exhausted ({current_usage:.1f}% > {threshold:.1f}%)",
            {
                'resource_type': resource_type,
                'current_usage': current_usage,
                'threshold': threshold,
                'exceeded_by': current_usage - threshold
            },
            NotificationSeverity.WARNING
        )
    
    async def _send_notification(self, notification: NotificationMessage):
        """Send notification through all configured channels"""
        try:
            # Add to history
            self.notification_history.append(notification)
            
            # Keep only last 1000 notifications
            if len(self.notification_history) > 1000:
                self.notification_history = self.notification_history[-1000:]
            
            # Send through each channel
            tasks = []
            for channel in notification.channels:
                if channel in self.channel_handlers:
                    task = asyncio.create_task(
                        self._send_with_retry(
                            channel,
                            notification,
                            self.channel_handlers[channel]
                        )
                    )
                    tasks.append(task)
            
            # Wait for all channels to complete
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Update statistics
            for i, result in enumerate(results):
                channel = notification.channels[i]
                if isinstance(result, Exception):
                    self.stats['total_failed'] += 1
                    self.stats['by_channel'][channel.value] = self.stats['by_channel'].get(channel.value, {'sent': 0, 'failed': 0})
                    self.stats['by_channel'][channel.value]['failed'] += 1
                else:
                    self.stats['total_sent'] += 1
                    self.stats['by_channel'][channel.value] = self.stats['by_channel'].get(channel.value, {'sent': 0, 'failed': 0})
                    self.stats['by_channel'][channel.value]['sent'] += 1
            
            # Update type and severity statistics
            self.stats['by_type'][notification.type.value] = self.stats['by_type'].get(notification.type.value, 0) + 1
            self.stats['by_severity'][notification.severity.value] = self.stats['by_severity'].get(notification.severity.value, 0) + 1
            
        except Exception as e:
            logger.error(f"Error sending notification {notification.notification_id}: {str(e)}")
            raise
    
    async def _send_with_retry(
        self,
        channel: NotificationChannel,
        notification: NotificationMessage,
        handler: Callable
    ):
        """Send notification with retry logic"""
        last_exception = None
        
        for attempt in range(self.retry_attempts):
            try:
                await handler(notification)
                return
                
            except Exception as e:
                last_exception = e
                logger.warning(f"Failed to send {channel} notification (attempt {attempt + 1}/{self.retry_attempts}): {str(e)}")
                
                if attempt < self.retry_attempts - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
        
        # All retries failed
        logger.error(f"Failed to send {channel} notification after {self.retry_attempts} attempts: {str(last_exception)}")
        raise last_exception
    
    async def _send_email(self, notification: NotificationMessage):
        """Send email notification"""
        try:
            # Create email message
            msg = MIMEMultipart()
            msg['From'] = self.email_from
            msg['To'] = ', '.join(notification.recipients)
            msg['Subject'] = f"[{notification.severity.value.upper()}] {notification.title}"
            
            # Create HTML body
            html_body = self._create_email_html(notification)
            msg.attach(MIMEText(html_body, 'html'))
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                if self.smtp_username and self.smtp_password:
                    server.starttls()
                    server.login(self.smtp_username, self.smtp_password)
                
                server.send_message(msg)
            
            logger.info(f"Email notification sent for {notification.notification_id}")
            
        except Exception as e:
            logger.error(f"Failed to send email notification: {str(e)}")
            raise
    
    def _create_email_html(self, notification: NotificationMessage) -> str:
        """Create HTML email body"""
        severity_colors = {
            NotificationSeverity.INFO: '#17a2b8',
            NotificationSeverity.WARNING: '#ffc107',
            NotificationSeverity.ERROR: '#dc3545',
            NotificationSeverity.CRITICAL: '#721c24'
        }
        
        color = severity_colors.get(notification.severity, '#6c757d')
        
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
                <div style="background-color: {color}; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">{notification.title}</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">{notification.severity.value.upper()}</p>
                </div>
                
                <div style="padding: 20px;">
                    <p style="font-size: 16px; line-height: 1.5; color: #333;">{notification.message}</p>
                    
                    <div style="background-color: #f8f9fa; border-radius: 4px; padding: 15px; margin: 20px 0;">
                        <h3 style="margin: 0 0 10px 0; color: #495057;">Details:</h3>
                        <table style="width: 100%; border-collapse: collapse;">
        """
        
        # Add details to table
        for key, value in notification.details.items():
            html += f"""
                            <tr>
                                <td style="padding: 5px; border-bottom: 1px solid #dee2e6; font-weight: bold; color: #495057;">{key.replace('_', ' ').title()}:</td>
                                <td style="padding: 5px; border-bottom: 1px solid #dee2e6; color: #6c757d;">{value}</td>
                            </tr>
            """
        
        html += f"""
                        </table>
                    </div>
                    
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d;">
                        <p style="margin: 0;">Notification ID: {notification.notification_id}</p>
                        <p style="margin: 5px 0 0 0;">Timestamp: {notification.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html
    
    async def _send_webhook(self, notification: NotificationMessage):
        """Send webhook notification"""
        try:
            webhook_url = self.webhook_urls.get('default')
            if not webhook_url:
                logger.warning("No webhook URL configured")
                return
            
            payload = notification.to_dict()
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    webhook_url,
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                )
                
                response.raise_for_status()
            
            logger.info(f"Webhook notification sent for {notification.notification_id}")
            
        except Exception as e:
            logger.error(f"Failed to send webhook notification: {str(e)}")
            raise
    
    async def _send_slack(self, notification: NotificationMessage):
        """Send Slack notification"""
        try:
            slack_webhook_url = self.webhook_urls.get('slack')
            if not slack_webhook_url:
                logger.warning("No Slack webhook URL configured")
                return
            
            # Create Slack message
            color_map = {
                NotificationSeverity.INFO: '#36a64f',
                NotificationSeverity.WARNING: '#ff9500',
                NotificationSeverity.ERROR: '#ff0000',
                NotificationSeverity.CRITICAL: '#8b0000'
            }
            
            payload = {
                "attachments": [
                    {
                        "color": color_map.get(notification.severity, '#6c757d'),
                        "title": notification.title,
                        "text": notification.message,
                        "fields": [
                            {
                                "title": "Severity",
                                "value": notification.severity.value.upper(),
                                "short": True
                            },
                            {
                                "title": "Type",
                                "value": notification.type.value,
                                "short": True
                            }
                        ],
                        "footer": f"Notification ID: {notification.notification_id}",
                        "ts": int(notification.timestamp.timestamp())
                    }
                ]
            }
            
            # Add details as fields
            for key, value in list(notification.details.items())[:5]:  # Limit to 5 fields
                payload["attachments"][0]["fields"].append({
                    "title": key.replace('_', ' ').title(),
                    "value": str(value),
                    "short": True
                })
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    slack_webhook_url,
                    json=payload
                )
                
                response.raise_for_status()
            
            logger.info(f"Slack notification sent for {notification.notification_id}")
            
        except Exception as e:
            logger.error(f"Failed to send Slack notification: {str(e)}")
            raise
    
    async def _send_sms(self, notification: NotificationMessage):
        """Send SMS notification (placeholder implementation)"""
        # In a real implementation, this would integrate with an SMS service
        logger.info(f"SMS notification would be sent for {notification.notification_id}")
    
    async def _send_in_app(self, notification: NotificationMessage):
        """Send in-app notification (placeholder implementation)"""
        # In a real implementation, this would store notifications in a database
        # for retrieval by the web interface
        logger.info(f"In-app notification stored for {notification.notification_id}")
    
    def _generate_notification_id(self) -> str:
        """Generate unique notification ID"""
        import uuid
        return str(uuid.uuid4())
    
    async def get_notification_history(
        self,
        limit: int = 100,
        offset: int = 0,
        severity: Optional[NotificationSeverity] = None,
        type_filter: Optional[NotificationType] = None
    ) -> List[NotificationMessage]:
        """Get notification history with optional filtering"""
        notifications = self.notification_history
        
        # Apply filters
        if severity:
            notifications = [n for n in notifications if n.severity == severity]
        
        if type_filter:
            notifications = [n for n in notifications if n.type == type_filter]
        
        # Sort by timestamp (descending)
        notifications.sort(key=lambda n: n.timestamp, reverse=True)
        
        # Apply pagination
        return notifications[offset:offset + limit]
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get notification statistics"""
        return self.stats.copy()
    
    async def add_subscriber(
        self,
        notification_type: NotificationType,
        recipient: str,
        channels: Optional[List[NotificationChannel]] = None
    ):
        """Add a subscriber for a notification type"""
        if notification_type not in self.subscribers:
            self.subscribers[notification_type] = []
        
        if recipient not in self.subscribers[notification_type]:
            self.subscribers[notification_type].append(recipient)
        
        logger.info(f"Added subscriber {recipient} for {notification_type.value}")
    
    async def remove_subscriber(
        self,
        notification_type: NotificationType,
        recipient: str
    ):
        """Remove a subscriber for a notification type"""
        if notification_type in self.subscribers:
            try:
                self.subscribers[notification_type].remove(recipient)
                logger.info(f"Removed subscriber {recipient} for {notification_type.value}")
            except ValueError:
                pass  # Subscriber not found
