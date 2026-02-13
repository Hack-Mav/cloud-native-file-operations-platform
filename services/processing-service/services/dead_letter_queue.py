import asyncio
import json
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from pathlib import Path

from ..models import Job, JobStatus
from ..database.datastore import DatastoreClient
from ..config import Settings

logger = logging.getLogger(__name__)

class DeadLetterReason(str, Enum):
    MAX_RETRIES_EXCEEDED = "max_retries_exceeded"
    PERMANENT_FAILURE = "permanent_failure"
    TIMEOUT = "timeout"
    INVALID_INPUT = "invalid_input"
    RESOURCE_EXHAUSTED = "resource_exhausted"
    CONFIGURATION_ERROR = "configuration_error"
    UNKNOWN = "unknown"

class DeadLetterAction(str, Enum):
    RETRY_LATER = "retry_later"
    MANUAL_REVIEW = "manual_review"
    ARCHIVE = "archive"
    DELETE = "delete"
    NOTIFY = "notify"

@dataclass
class DeadLetterEntry:
    """Represents a job in the dead letter queue"""
    job_id: str
    file_id: str
    original_job_data: Dict[str, Any]
    failure_reason: DeadLetterReason
    error_message: str
    error_details: Dict[str, Any]
    retry_count: int
    first_failed_at: datetime
    last_failed_at: datetime
    processing_attempts: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    recommended_action: DeadLetterAction
    priority: int = 0  # Higher priority = more important
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        data = asdict(self)
        # Convert datetime objects to ISO strings
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeadLetterEntry":
        """Create from dictionary"""
        # Convert ISO strings back to datetime objects
        for key, value in data.items():
            if key.endswith('_at') and isinstance(value, str):
                data[key] = datetime.fromisoformat(value)
        
        return cls(**data)

class DeadLetterQueue:
    """Manages permanently failed jobs in a dead letter queue"""
    
    def __init__(self, settings: Settings, datastore_client: DatastoreClient):
        self.settings = settings
        self.datastore_client = datastore_client
        self.entries: Dict[str, DeadLetterEntry] = {}
        self.processing_handlers: Dict[DeadLetterAction, Callable] = {}
        
        # Configuration
        self.max_queue_size = settings.get('DLQ_MAX_SIZE', 10000)
        self.retention_days = settings.get('DLQ_RETENTION_DAYS', 30)
        self.auto_retry_interval_hours = settings.get('DLQ_AUTO_RETRY_HOURS', 24)
        
        # Statistics
        self.stats = {
            'total_entries': 0,
            'entries_by_reason': {},
            'entries_by_action': {},
            'processed_entries': 0,
            'failed_processing': 0
        }
        
        # Register default handlers
        self._register_default_handlers()
        
        logger.info("Dead letter queue initialized")
    
    def _register_default_handlers(self):
        """Register default processing handlers"""
        self.processing_handlers[DeadLetterAction.RETRY_LATER] = self._handle_retry_later
        self.processing_handlers[DeadLetterAction.MANUAL_REVIEW] = self._handle_manual_review
        self.processing_handlers[DeadLetterAction.ARCHIVE] = self._handle_archive
        self.processing_handlers[DeadLetterAction.DELETE] = self._handle_delete
        self.processing_handlers[DeadLetterAction.NOTIFY] = self._handle_notify
    
    async def add_job(
        self,
        job: Job,
        error: Exception,
        retry_count: int,
        processing_attempts: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Add a failed job to the dead letter queue
        
        Args:
            job: The failed job
            error: The error that caused the failure
            retry_count: Number of retry attempts
            processing_attempts: History of processing attempts
        
        Returns:
            Entry ID in the dead letter queue
        """
        try:
            # Determine failure reason
            failure_reason = self._classify_failure_reason(error, retry_count)
            
            # Determine recommended action
            recommended_action = self._recommend_action(failure_reason, error, retry_count)
            
            # Create dead letter entry
            entry = DeadLetterEntry(
                job_id=job.job_id,
                file_id=job.file_id,
                original_job_data=job.dict(),
                failure_reason=failure_reason,
                error_message=str(error),
                error_details={
                    'error_type': type(error).__name__,
                    'error_args': getattr(error, 'args', []),
                    'traceback': getattr(error, '__traceback__', None)
                },
                retry_count=retry_count,
                first_failed_at=job.started_at or job.created_at,
                last_failed_at=datetime.utcnow(),
                processing_attempts=processing_attempts or [],
                metadata=job.metadata,
                recommended_action=recommended_action,
                priority=self._calculate_priority(job, failure_reason, retry_count)
            )
            
            # Check queue size limit
            if len(self.entries) >= self.max_queue_size:
                await self._cleanup_old_entries()
            
            # Add to queue
            self.entries[entry.job_id] = entry
            
            # Save to database
            await self._save_entry(entry)
            
            # Update statistics
            self._update_statistics(entry, 'added')
            
            logger.warning(f"Added job {job.job_id} to dead letter queue: {failure_reason.value}")
            
            return entry.job_id
            
        except Exception as e:
            logger.error(f"Error adding job {job.job_id} to dead letter queue: {str(e)}")
            raise
    
    def _classify_failure_reason(self, error: Exception, retry_count: int) -> DeadLetterReason:
        """Classify the reason for failure"""
        error_message = str(error).lower()
        error_type = type(error).__name__.lower()
        
        # Check for specific patterns
        if retry_count >= 3:
            return DeadLetterReason.MAX_RETRIES_EXCEEDED
        
        if "invalid" in error_message or "not found" in error_message:
            return DeadLetterReason.INVALID_INPUT
        
        if "timeout" in error_message or "deadline" in error_message:
            return DeadLetterReason.TIMEOUT
        
        if "resource" in error_message or "memory" in error_message or "disk" in error_message:
            return DeadLetterReason.RESOURCE_EXHAUSTED
        
        if "config" in error_message or "setting" in error_message:
            return DeadLetterReason.CONFIGURATION_ERROR
        
        if "permanent" in error_message or "fatal" in error_message:
            return DeadLetterReason.PERMANENT_FAILURE
        
        return DeadLetterReason.UNKNOWN
    
    def _recommend_action(
        self, 
        failure_reason: DeadLetterReason, 
        error: Exception, 
        retry_count: int
    ) -> DeadLetterAction:
        """Recommend action based on failure reason"""
        if failure_reason == DeadLetterReason.MAX_RETRIES_EXCEEDED:
            return DeadLetterAction.MANUAL_REVIEW
        
        elif failure_reason == DeadLetterReason.TIMEOUT:
            return DeadLetterAction.RETRY_LATER
        
        elif failure_reason == DeadLetterReason.RESOURCE_EXHAUSTED:
            return DeadLetterAction.RETRY_LATER
        
        elif failure_reason == DeadLetterReason.INVALID_INPUT:
            return DeadLetterAction.MANUAL_REVIEW
        
        elif failure_reason == DeadLetterReason.CONFIGURATION_ERROR:
            return DeadLetterAction.MANUAL_REVIEW
        
        elif failure_reason == DeadLetterReason.PERMANENT_FAILURE:
            return DeadLetterAction.ARCHIVE
        
        else:
            return DeadLetterAction.MANUAL_REVIEW
    
    def _calculate_priority(self, job: Job, failure_reason: DeadLetterReason, retry_count: int) -> int:
        """Calculate priority for the dead letter entry"""
        priority = 0
        
        # Higher priority for recent jobs
        hours_since_failure = (datetime.utcnow() - job.created_at).total_seconds() / 3600
        if hours_since_failure < 1:
            priority += 10
        elif hours_since_failure < 24:
            priority += 5
        
        # Higher priority for certain failure reasons
        if failure_reason == DeadLetterReason.RESOURCE_EXHAUSTED:
            priority += 8
        elif failure_reason == DeadLetterReason.CONFIGURATION_ERROR:
            priority += 6
        
        # Higher priority for jobs with more retries (indicates persistence)
        priority += min(retry_count, 5)
        
        # Higher priority for urgent jobs
        if hasattr(job, 'priority') and job.priority.value == 'urgent':
            priority += 10
        
        return priority
    
    async def get_entry(self, job_id: str) -> Optional[DeadLetterEntry]:
        """Get a dead letter entry by job ID"""
        entry = self.entries.get(job_id)
        if entry:
            return entry
        
        # Try to load from database
        try:
            entry_data = await self._load_entry(job_id)
            if entry_data:
                entry = DeadLetterEntry.from_dict(entry_data)
                self.entries[job_id] = entry
                return entry
        except Exception as e:
            logger.error(f"Error loading dead letter entry {job_id}: {str(e)}")
        
        return None
    
    async def list_entries(
        self,
        reason: Optional[DeadLetterReason] = None,
        action: Optional[DeadLetterAction] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[DeadLetterEntry]:
        """List dead letter entries with optional filtering"""
        try:
            # Load entries from database if needed
            await self._load_all_entries()
            
            entries = list(self.entries.values())
            
            # Apply filters
            if reason:
                entries = [e for e in entries if e.failure_reason == reason]
            
            if action:
                entries = [e for e in entries if e.recommended_action == action]
            
            # Sort by priority (descending) and then by failure time (descending)
            entries.sort(key=lambda e: (e.priority, e.last_failed_at), reverse=True)
            
            # Apply pagination
            return entries[offset:offset + limit]
            
        except Exception as e:
            logger.error(f"Error listing dead letter entries: {str(e)}")
            return []
    
    async def process_entry(
        self,
        job_id: str,
        action: Optional[DeadLetterAction] = None,
        parameters: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Process a dead letter entry
        
        Args:
            job_id: Job ID to process
            action: Action to take (uses recommended action if not specified)
            parameters: Additional parameters for the action
        
        Returns:
            True if processing was successful
        """
        try:
            entry = await self.get_entry(job_id)
            if not entry:
                logger.error(f"Dead letter entry {job_id} not found")
                return False
            
            action = action or entry.recommended_action
            parameters = parameters or {}
            
            # Get handler for the action
            handler = self.processing_handlers.get(action)
            if not handler:
                logger.error(f"No handler found for action {action}")
                return False
            
            # Execute handler
            success = await handler(entry, parameters)
            
            if success:
                # Remove from queue
                await self.remove_entry(job_id)
                self._update_statistics(entry, 'processed')
                logger.info(f"Successfully processed dead letter entry {job_id} with action {action}")
            else:
                self._update_statistics(entry, 'failed_processing')
                logger.error(f"Failed to process dead letter entry {job_id} with action {action}")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing dead letter entry {job_id}: {str(e)}")
            return False
    
    async def remove_entry(self, job_id: str) -> bool:
        """Remove an entry from the dead letter queue"""
        try:
            if job_id in self.entries:
                del self.entries[job_id]
            
            # Remove from database
            await self._delete_entry(job_id)
            
            logger.info(f"Removed dead letter entry {job_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error removing dead letter entry {job_id}: {str(e)}")
            return False
    
    async def retry_job(self, job_id: str, delay_minutes: int = 0) -> bool:
        """Retry a job from the dead letter queue"""
        try:
            entry = await self.get_entry(job_id)
            if not entry:
                return False
            
            # Create new job from original data
            from ..models import Job
            job = Job(**entry.original_job_data)
            
            # Reset job status
            job.status = JobStatus.PENDING
            job.error_message = None
            job.result = None
            
            # Schedule retry with delay
            if delay_minutes > 0:
                await asyncio.sleep(delay_minutes * 60)
            
            # In a real implementation, this would re-queue the job
            # For now, we just remove it from DLQ and log
            await self.remove_entry(job_id)
            
            logger.info(f"Retrying job {job_id} from dead letter queue")
            return True
            
        except Exception as e:
            logger.error(f"Error retrying job {job_id}: {str(e)}")
            return False
    
    async def _handle_retry_later(self, entry: DeadLetterEntry, parameters: Dict[str, Any]) -> bool:
        """Handle retry later action"""
        delay_hours = parameters.get('delay_hours', self.auto_retry_interval_hours)
        return await self.retry_job(entry.job_id, delay_hours * 60)
    
    async def _handle_manual_review(self, entry: DeadLetterEntry, parameters: Dict[str, Any]) -> bool:
        """Handle manual review action"""
        # In a real implementation, this would:
        # 1. Send notification to administrators
        # 2. Create a ticket in a ticketing system
        # 3. Add to a review queue
        
        logger.info(f"Job {entry.job_id} flagged for manual review: {entry.error_message}")
        
        # For now, just mark as reviewed and keep in queue
        return True
    
    async def _handle_archive(self, entry: DeadLetterEntry, parameters: Dict[str, Any]) -> bool:
        """Handle archive action"""
        # In a real implementation, this would:
        # 1. Move job data to long-term storage
        # 2. Compress and archive related files
        # 3. Update audit logs
        
        logger.info(f"Archiving job {entry.job_id}")
        return True
    
    async def _handle_delete(self, entry: DeadLetterEntry, parameters: Dict[str, Any]) -> bool:
        """Handle delete action"""
        # Remove the entry (already done in process_entry)
        logger.info(f"Deleting job {entry.job_id}")
        return True
    
    async def _handle_notify(self, entry: DeadLetterEntry, parameters: Dict[str, Any]) -> bool:
        """Handle notify action"""
        # Send notification about the failure
        notification_data = {
            'job_id': entry.job_id,
            'file_id': entry.file_id,
            'failure_reason': entry.failure_reason.value,
            'error_message': entry.error_message,
            'retry_count': entry.retry_count,
            'failed_at': entry.last_failed_at.isoformat()
        }
        
        # In a real implementation, this would send via email, Slack, etc.
        logger.info(f"Sending notification for failed job {entry.job_id}: {notification_data}")
        
        return True
    
    async def _save_entry(self, entry: DeadLetterEntry):
        """Save entry to database"""
        try:
            await self.datastore_client.save_dead_letter_entry(entry)
        except Exception as e:
            logger.error(f"Error saving dead letter entry: {str(e)}")
    
    async def _load_entry(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Load entry from database"""
        try:
            return await self.datastore_client.get_dead_letter_entry(job_id)
        except Exception as e:
            logger.error(f"Error loading dead letter entry: {str(e)}")
            return None
    
    async def _load_all_entries(self):
        """Load all entries from database"""
        try:
            entries_data = await self.datastore_client.query_dead_letter_entries(limit=1000)
            for entry_data in entries_data:
                entry = DeadLetterEntry.from_dict(entry_data)
                self.entries[entry.job_id] = entry
        except Exception as e:
            logger.error(f"Error loading dead letter entries: {str(e)}")
    
    async def _delete_entry(self, job_id: str):
        """Delete entry from database"""
        try:
            await self.datastore_client.delete_dead_letter_entry(job_id)
        except Exception as e:
            logger.error(f"Error deleting dead letter entry: {str(e)}")
    
    async def _cleanup_old_entries(self):
        """Remove old entries based on retention policy"""
        try:
            cutoff_time = datetime.utcnow() - timedelta(days=self.retention_days)
            entries_to_remove = []
            
            for entry in self.entries.values():
                if entry.last_failed_at < cutoff_time:
                    entries_to_remove.append(entry.job_id)
            
            for job_id in entries_to_remove:
                await self.remove_entry(job_id)
            
            logger.info(f"Cleaned up {len(entries_to_remove)} old dead letter entries")
            
        except Exception as e:
            logger.error(f"Error cleaning up old dead letter entries: {str(e)}")
    
    def _update_statistics(self, entry: DeadLetterEntry, operation: str):
        """Update statistics"""
        try:
            if operation == 'added':
                self.stats['total_entries'] += 1
                
                reason = entry.failure_reason.value
                self.stats['entries_by_reason'][reason] = self.stats['entries_by_reason'].get(reason, 0) + 1
                
                action = entry.recommended_action.value
                self.stats['entries_by_action'][action] = self.stats['entries_by_action'].get(action, 0) + 1
            
            elif operation == 'processed':
                self.stats['processed_entries'] += 1
            
            elif operation == 'failed_processing':
                self.stats['failed_processing'] += 1
                
        except Exception as e:
            logger.error(f"Error updating statistics: {str(e)}")
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get dead letter queue statistics"""
        return self.stats.copy()
    
    async def get_queue_health(self) -> Dict[str, Any]:
        """Get health information about the dead letter queue"""
        try:
            await self._load_all_entries()
            
            total_entries = len(self.entries)
            
            # Calculate age distribution
            now = datetime.utcnow()
            age_distribution = {
                'less_than_1_hour': 0,
                'less_than_24_hours': 0,
                'less_than_7_days': 0,
                'older_than_7_days': 0
            }
            
            for entry in self.entries.values():
                age_hours = (now - entry.last_failed_at).total_seconds() / 3600
                
                if age_hours < 1:
                    age_distribution['less_than_1_hour'] += 1
                elif age_hours < 24:
                    age_distribution['less_than_24_hours'] += 1
                elif age_hours < 168:  # 7 days
                    age_distribution['less_than_7_days'] += 1
                else:
                    age_distribution['older_than_7_days'] += 1
            
            return {
                'total_entries': total_entries,
                'max_queue_size': self.max_queue_size,
                'queue_utilization': total_entries / self.max_queue_size,
                'age_distribution': age_distribution,
                'retention_days': self.retention_days,
                'statistics': self.stats
            }
            
        except Exception as e:
            logger.error(f"Error getting queue health: {str(e)}")
            return {}
