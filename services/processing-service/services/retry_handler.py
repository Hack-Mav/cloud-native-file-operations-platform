import asyncio
import random
import time
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import logging
import json

from ..models import Job, JobStatus
from ..config import Settings

logger = logging.getLogger(__name__)

class RetryStrategy(str, Enum):
    EXPONENTIAL_BACKOFF = "exponential_backoff"
    LINEAR_BACKOFF = "linear_backoff"
    FIXED_INTERVAL = "fixed_interval"
    IMMEDIATE = "immediate"

class FailureType(str, Enum):
    TRANSIENT = "transient"  # Temporary failures (network, resource constraints)
    PERMANENT = "permanent"  # Permanent failures (invalid data, configuration)
    RATE_LIMIT = "rate_limit"  # Rate limiting failures
    TIMEOUT = "timeout"  # Timeout failures
    UNKNOWN = "unknown"

@dataclass
class RetryConfig:
    """Configuration for retry behavior"""
    max_attempts: int = 3
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_BACKOFF
    base_delay_seconds: float = 1.0
    max_delay_seconds: float = 300.0
    backoff_multiplier: float = 2.0
    jitter: bool = True
    retry_on_exceptions: List[str] = None
    
    def __post_init__(self):
        if self.retry_on_exceptions is None:
            self.retry_on_exceptions = [
                "ConnectionError",
                "TimeoutError", 
                "TemporaryFailure",
                "ResourceExhausted",
                "RateLimitError"
            ]

@dataclass
class RetryAttempt:
    """Information about a retry attempt"""
    attempt_number: int
    timestamp: datetime
    delay_seconds: float
    error_message: str
    error_type: str
    will_retry: bool

class RetryHandler:
    """Handles retry logic with exponential backoff and failure classification"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.retry_history: Dict[str, List[RetryAttempt]] = {}
        self.failure_patterns: Dict[str, FailureType] = {}
        self.default_config = RetryConfig()
        
        # Load failure patterns from configuration
        self._load_failure_patterns()
        
        logger.info("Retry handler initialized")
    
    def _load_failure_patterns(self):
        """Load failure patterns for classification"""
        self.failure_patterns = {
            # Transient failures
            "connection": FailureType.TRANSIENT,
            "timeout": FailureType.TRANSIENT,
            "network": FailureType.TRANSIENT,
            "temporary": FailureType.TRANSIENT,
            "resource": FailureType.TRANSIENT,
            
            # Permanent failures
            "invalid": FailureType.PERMANENT,
            "not found": FailureType.PERMANENT,
            "permission": FailureType.PERMANENT,
            "authentication": FailureType.PERMANENT,
            "format": FailureType.PERMANENT,
            "corrupt": FailureType.PERMANENT,
            
            # Rate limiting
            "rate limit": FailureType.RATE_LIMIT,
            "too many": FailureType.RATE_LIMIT,
            "quota": FailureType.RATE_LIMIT,
            
            # Timeout
            "timeout": FailureType.TIMEOUT,
            "deadline": FailureType.TIMEOUT,
        }
    
    async def should_retry(
        self, 
        job: Job, 
        error: Exception, 
        config: Optional[RetryConfig] = None
    ) -> tuple[bool, float]:
        """
        Determine if a job should be retried and calculate delay
        
        Returns:
            Tuple of (should_retry, delay_seconds)
        """
        try:
            retry_config = config or self.default_config
            
            # Check if we've exceeded max attempts
            current_attempts = self._get_attempt_count(job.job_id)
            if current_attempts >= retry_config.max_attempts:
                logger.info(f"Job {job.job_id} exceeded max retry attempts ({retry_config.max_attempts})")
                return False, 0.0
            
            # Classify the failure
            failure_type = self._classify_failure(error)
            
            # Don't retry permanent failures
            if failure_type == FailureType.PERMANENT:
                logger.info(f"Job {job.job_id} failed with permanent error: {str(error)}")
                return False, 0.0
            
            # Check if error type is in retry list
            error_type_name = type(error).__name__
            if error_type_name not in retry_config.retry_on_exceptions:
                logger.info(f"Job {job.job_id} failed with non-retryable error: {error_type_name}")
                return False, 0.0
            
            # Calculate delay based on strategy
            delay = self._calculate_delay(
                current_attempts, 
                retry_config, 
                failure_type
            )
            
            # Record retry attempt
            await self._record_retry_attempt(job.job_id, current_attempts + 1, delay, error)
            
            logger.info(f"Job {job.job_id} will retry in {delay:.2f}s (attempt {current_attempts + 1}/{retry_config.max_attempts})")
            
            return True, delay
            
        except Exception as e:
            logger.error(f"Error in should_retry for job {job.job_id}: {str(e)}")
            return False, 0.0
    
    def _classify_failure(self, error: Exception) -> FailureType:
        """Classify the type of failure based on error message and type"""
        try:
            error_message = str(error).lower()
            error_type = type(error).__name__.lower()
            
            # Check patterns in error message
            for pattern, failure_type in self.failure_patterns.items():
                if pattern in error_message or pattern in error_type:
                    return failure_type
            
            # Special classification based on exception type
            if isinstance(error, (ConnectionError, OSError)):
                return FailureType.TRANSIENT
            elif isinstance(error, (ValueError, TypeError)):
                return FailureType.PERMANENT
            elif isinstance(error, TimeoutError):
                return FailureType.TIMEOUT
            
            return FailureType.UNKNOWN
            
        except Exception as e:
            logger.error(f"Error classifying failure: {str(e)}")
            return FailureType.UNKNOWN
    
    def _calculate_delay(
        self, 
        attempt_count: int, 
        config: RetryConfig, 
        failure_type: FailureType
    ) -> float:
        """Calculate retry delay based on strategy"""
        try:
            if config.strategy == RetryStrategy.IMMEDIATE:
                return 0.0
            
            elif config.strategy == RetryStrategy.FIXED_INTERVAL:
                delay = config.base_delay_seconds
            
            elif config.strategy == RetryStrategy.LINEAR_BACKOFF:
                delay = config.base_delay_seconds * attempt_count
            
            elif config.strategy == RetryStrategy.EXPONENTIAL_BACKOFF:
                delay = config.base_delay_seconds * (config.backoff_multiplier ** (attempt_count - 1))
            
            else:
                delay = config.base_delay_seconds
            
            # Apply failure type adjustments
            if failure_type == FailureType.RATE_LIMIT:
                # Longer delays for rate limiting
                delay *= 2.0
            elif failure_type == FailureType.TIMEOUT:
                # Moderate delays for timeouts
                delay *= 1.5
            
            # Apply maximum delay limit
            delay = min(delay, config.max_delay_seconds)
            
            # Add jitter if enabled
            if config.jitter:
                jitter_amount = delay * 0.1  # 10% jitter
                jitter = random.uniform(-jitter_amount, jitter_amount)
                delay += jitter
            
            # Ensure minimum delay
            delay = max(delay, 0.1)
            
            return delay
            
        except Exception as e:
            logger.error(f"Error calculating delay: {str(e)}")
            return config.base_delay_seconds
    
    async def _record_retry_attempt(
        self, 
        job_id: str, 
        attempt_number: int, 
        delay_seconds: float, 
        error: Exception
    ):
        """Record information about a retry attempt"""
        try:
            if job_id not in self.retry_history:
                self.retry_history[job_id] = []
            
            attempt = RetryAttempt(
                attempt_number=attempt_number,
                timestamp=datetime.utcnow(),
                delay_seconds=delay_seconds,
                error_message=str(error),
                error_type=type(error).__name__,
                will_retry=attempt_number < self.default_config.max_attempts
            )
            
            self.retry_history[job_id].append(attempt)
            
            # Keep only last 10 attempts per job
            if len(self.retry_history[job_id]) > 10:
                self.retry_history[job_id] = self.retry_history[job_id][-10:]
                
        except Exception as e:
            logger.error(f"Error recording retry attempt for job {job_id}: {str(e)}")
    
    def _get_attempt_count(self, job_id: str) -> int:
        """Get the number of retry attempts for a job"""
        return len(self.retry_history.get(job_id, []))
    
    async def execute_with_retry(
        self,
        job_id: str,
        operation: Callable,
        config: Optional[RetryConfig] = None,
        *args,
        **kwargs
    ) -> Any:
        """
        Execute an operation with retry logic
        
        Args:
            job_id: Job identifier for tracking
            operation: Function to execute
            config: Retry configuration
            *args, **kwargs: Arguments to pass to operation
            
        Returns:
            Result of the operation
            
        Raises:
            Last exception if all retries fail
        """
        retry_config = config or self.default_config
        last_exception = None
        
        for attempt in range(retry_config.max_attempts):
            try:
                # Execute the operation
                result = await operation(*args, **kwargs)
                
                # Success - clear retry history
                if job_id in self.retry_history:
                    del self.retry_history[job_id]
                
                logger.info(f"Job {job_id} succeeded on attempt {attempt + 1}")
                return result
                
            except Exception as e:
                last_exception = e
                
                # Check if we should retry
                should_retry, delay = await self.should_retry(
                    Job(job_id=job_id, file_id=""),  # Minimal job for retry logic
                    e,
                    retry_config
                )
                
                if not should_retry or attempt == retry_config.max_attempts - 1:
                    logger.error(f"Job {job_id} failed permanently after {attempt + 1} attempts: {str(e)}")
                    raise e
                
                # Wait before retry
                if delay > 0:
                    await asyncio.sleep(delay)
        
        # This should never be reached, but just in case
        raise last_exception
    
    def get_retry_history(self, job_id: str) -> List[RetryAttempt]:
        """Get retry history for a job"""
        return self.retry_history.get(job_id, [])
    
    def get_retry_statistics(self) -> Dict[str, Any]:
        """Get retry statistics across all jobs"""
        try:
            total_retries = sum(len(attempts) for attempts in self.retry_history.values())
            jobs_with_retries = len(self.retry_history)
            
            if jobs_with_retries == 0:
                return {
                    'total_retries': 0,
                    'jobs_with_retries': 0,
                    'average_retries_per_job': 0.0,
                    'failure_types': {},
                    'most_common_errors': []
                }
            
            # Calculate failure type distribution
            failure_types = {}
            error_counts = {}
            
            for attempts in self.retry_history.values():
                for attempt in attempts:
                    error_type = attempt.error_type
                    error_message = attempt.error_message[:100]  # First 100 chars
                    
                    failure_types[error_type] = failure_types.get(error_type, 0) + 1
                    error_counts[error_message] = error_counts.get(error_message, 0) + 1
            
            # Most common errors
            most_common_errors = sorted(
                error_counts.items(), 
                key=lambda x: x[1], 
                reverse=True
            )[:10]
            
            return {
                'total_retries': total_retries,
                'jobs_with_retries': jobs_with_retries,
                'average_retries_per_job': total_retries / jobs_with_retries,
                'failure_types': failure_types,
                'most_common_errors': most_common_errors
            }
            
        except Exception as e:
            logger.error(f"Error getting retry statistics: {str(e)}")
            return {}
    
    def clear_retry_history(self, job_id: str):
        """Clear retry history for a specific job"""
        if job_id in self.retry_history:
            del self.retry_history[job_id]
    
    def clear_old_retry_history(self, older_than_hours: int = 24):
        """Clear retry history older than specified hours"""
        try:
            cutoff_time = datetime.utcnow() - timedelta(hours=older_than_hours)
            jobs_to_remove = []
            
            for job_id, attempts in self.retry_history.items():
                # Check if all attempts are older than cutoff
                if all(attempt.timestamp < cutoff_time for attempt in attempts):
                    jobs_to_remove.append(job_id)
            
            for job_id in jobs_to_remove:
                del self.retry_history[job_id]
            
            logger.info(f"Cleared retry history for {len(jobs_to_remove)} jobs older than {older_than_hours} hours")
            
        except Exception as e:
            logger.error(f"Error clearing old retry history: {str(e)}")
    
    async def get_retry_config_for_job(self, job_id: str) -> RetryConfig:
        """Get retry configuration for a specific job"""
        # In a real implementation, this could be job-specific
        # For now, return default config
        return self.default_config
    
    def create_retry_config(
        self,
        max_attempts: int = 3,
        strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_BACKOFF,
        base_delay_seconds: float = 1.0,
        max_delay_seconds: float = 300.0,
        backoff_multiplier: float = 2.0,
        jitter: bool = True,
        retry_on_exceptions: Optional[List[str]] = None
    ) -> RetryConfig:
        """Create a custom retry configuration"""
        return RetryConfig(
            max_attempts=max_attempts,
            strategy=strategy,
            base_delay_seconds=base_delay_seconds,
            max_delay_seconds=max_delay_seconds,
            backoff_multiplier=backoff_multiplier,
            jitter=jitter,
            retry_on_exceptions=retry_on_exceptions or self.default_config.retry_on_exceptions
        )
