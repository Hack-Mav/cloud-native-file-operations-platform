import asyncio
import psutil
import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging
import json
from pathlib import Path

from ..models import WorkerMetrics, ScaleDecision, JobPriority, ResourceAllocation
from ..config import Settings

logger = logging.getLogger(__name__)

class WorkerScaler:
    """Manages dynamic worker scaling based on load and resource utilization"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.current_workers = settings.min_workers
        self.target_workers = settings.min_workers
        self.worker_metrics: Dict[str, WorkerMetrics] = {}
        self.scale_history: List[ScaleDecision] = []
        self.last_scale_time = datetime.utcnow()
        self.scale_cooldown_minutes = 5
        
        # Scaling thresholds
        self.scale_up_threshold = settings.worker_scale_up_threshold
        self.scale_down_threshold = settings.worker_scale_down_threshold
        self.min_workers = settings.min_workers
        self.max_workers = settings.max_workers
        
        # Resource tracking
        self.system_metrics = {
            'cpu_usage': 0.0,
            'memory_usage': 0.0,
            'disk_usage': 0.0,
            'load_average': 0.0
        }
        
        logger.info(f"Worker scaler initialized with {self.current_workers} workers")
    
    async def start_monitoring(self):
        """Start background monitoring and scaling"""
        asyncio.create_task(self._monitoring_loop())
        logger.info("Worker scaler monitoring started")
    
    async def register_worker(self, worker_id: str, max_concurrent_jobs: int = 5):
        """Register a new worker"""
        metrics = WorkerMetrics(
            worker_id=worker_id,
            status="idle",
            current_jobs=0,
            max_concurrent_jobs=max_concurrent_jobs,
            cpu_usage=0.0,
            memory_usage=0.0,
            last_heartbeat=datetime.utcnow(),
            jobs_completed=0,
            jobs_failed=0,
            average_processing_time=0.0
        )
        
        self.worker_metrics[worker_id] = metrics
        logger.info(f"Registered worker {worker_id}")
    
    async def update_worker_metrics(self, worker_id: str, metrics_update: Dict[str, Any]):
        """Update metrics for a specific worker"""
        if worker_id not in self.worker_metrics:
            await self.register_worker(worker_id)
        
        worker = self.worker_metrics[worker_id]
        
        # Update metrics
        for key, value in metrics_update.items():
            if hasattr(worker, key):
                setattr(worker, key, value)
        
        worker.last_heartbeat = datetime.utcnow()
        
        # Update worker status based on current jobs
        if worker.current_jobs == 0:
            worker.status = "idle"
        elif worker.current_jobs >= worker.max_concurrent_jobs:
            worker.status = "busy"
        else:
            worker.status = "active"
    
    async def get_scaling_decision(self) -> ScaleDecision:
        """Analyze current load and make scaling decision"""
        try:
            # Get current system metrics
            await self._update_system_metrics()
            
            # Calculate load metrics
            total_capacity = sum(w.max_concurrent_jobs for w in self.worker_metrics.values())
            current_load = sum(w.current_jobs for w in self.worker_metrics.values())
            load_percentage = current_load / total_capacity if total_capacity > 0 else 0
            
            # Get queue metrics (would come from job manager)
            queue_size = await self._get_queue_size()
            
            # Calculate scaling factors
            cpu_factor = self.system_metrics['cpu_usage'] / 100.0
            memory_factor = self.system_metrics['memory_usage'] / 100.0
            load_factor = load_percentage
            
            # Combined load score
            load_score = max(cpu_factor, memory_factor, load_factor)
            
            # Make scaling decision
            action, target_count, reason = self._determine_scaling_action(
                load_score, queue_size, current_load, total_capacity
            )
            
            decision = ScaleDecision(
                action=action,
                target_workers=target_count,
                reason=reason,
                current_workers=self.current_workers,
                metrics={
                    'load_score': load_score,
                    'queue_size': queue_size,
                    'cpu_usage': self.system_metrics['cpu_usage'],
                    'memory_usage': self.system_metrics['memory_usage'],
                    'current_load': current_load,
                    'total_capacity': total_capacity
                }
            )
            
            return decision
            
        except Exception as e:
            logger.error(f"Error making scaling decision: {str(e)}")
            return ScaleDecision(
                action="no_action",
                target_workers=self.current_workers,
                reason=f"Error in scaling decision: {str(e)}",
                current_workers=self.current_workers,
                metrics={}
            )
    
    def _determine_scaling_action(
        self, 
        load_score: float, 
        queue_size: int, 
        current_load: int, 
        total_capacity: int
    ) -> tuple:
        """Determine what scaling action to take"""
        
        # Scale up conditions
        if (load_score > self.scale_up_threshold or 
            queue_size > 10 or 
            (current_load / total_capacity) > 0.8):
            
            if self.current_workers < self.max_workers:
                # Calculate how many workers to add
                if queue_size > 50:
                    target = min(self.current_workers + 5, self.max_workers)
                    reason = "High queue load - adding 5 workers"
                elif queue_size > 20:
                    target = min(self.current_workers + 3, self.max_workers)
                    reason = "Medium queue load - adding 3 workers"
                else:
                    target = min(self.current_workers + 1, self.max_workers)
                    reason = "Moderate load - adding 1 worker"
                
                return "scale_up", target, reason
        
        # Scale down conditions
        elif (load_score < self.scale_down_threshold and 
              queue_size == 0 and 
              self.current_workers > self.min_workers):
            
            # Only scale down if workers have been idle for a while
            idle_workers = len([w for w in self.worker_metrics.values() if w.status == "idle"])
            
            if idle_workers > 2:
                target = max(self.current_workers - 1, self.min_workers)
                reason = "Low load - removing 1 idle worker"
                return "scale_down", target, reason
        
        # No scaling needed
        return "no_action", self.current_workers, "Load within acceptable range"
    
    async def apply_scaling_decision(self, decision: ScaleDecision) -> bool:
        """Apply a scaling decision"""
        try:
            # Check cooldown period
            time_since_last_scale = datetime.utcnow() - self.last_scale_time
            if time_since_last_scale < timedelta(minutes=self.scale_cooldown_minutes):
                logger.info(f"Scaling cooldown active, skipping {decision.action}")
                return False
            
            if decision.action == "scale_up":
                success = await self._scale_up(decision.target_workers)
            elif decision.action == "scale_down":
                success = await self._scale_down(decision.target_workers)
            else:
                logger.info(f"No scaling action needed: {decision.reason}")
                return True
            
            if success:
                self.last_scale_time = datetime.utcnow()
                self.scale_history.append(decision)
                
                # Keep only last 50 scaling decisions
                if len(self.scale_history) > 50:
                    self.scale_history = self.scale_history[-50:]
                
                logger.info(f"Applied scaling decision: {decision.action} to {decision.target_workers} workers")
            
            return success
            
        except Exception as e:
            logger.error(f"Error applying scaling decision: {str(e)}")
            return False
    
    async def _scale_up(self, target_count: int) -> bool:
        """Scale up workers"""
        try:
            workers_to_add = target_count - self.current_workers
            
            for i in range(workers_to_add):
                worker_id = f"worker-{int(time.time())}-{i}"
                
                # In a real implementation, this would:
                # 1. Provision new container/VM
                # 2. Deploy worker code
                # 3. Register with load balancer
                # 4. Start worker process
                
                # For now, simulate worker creation
                await self.register_worker(worker_id)
                logger.info(f"Created new worker: {worker_id}")
            
            self.current_workers = target_count
            return True
            
        except Exception as e:
            logger.error(f"Error scaling up: {str(e)}")
            return False
    
    async def _scale_down(self, target_count: int) -> bool:
        """Scale down workers"""
        try:
            workers_to_remove = self.current_workers - target_count
            
            # Find idle workers to remove
            idle_workers = [
                worker_id for worker_id, metrics in self.worker_metrics.items()
                if metrics.status == "idle"
            ]
            
            if len(idle_workers) < workers_to_remove:
                logger.warning(f"Not enough idle workers to scale down from {self.current_workers} to {target_count}")
                return False
            
            # Remove workers
            for i in range(workers_to_remove):
                worker_id = idle_workers[i]
                
                # In a real implementation, this would:
                # 1. Stop accepting new jobs
                # 2. Wait for current jobs to complete
                # 3. Gracefully shutdown worker
                # 4. De-provision resources
                
                del self.worker_metrics[worker_id]
                logger.info(f"Removed worker: {worker_id}")
            
            self.current_workers = target_count
            return True
            
        except Exception as e:
            logger.error(f"Error scaling down: {str(e)}")
            return False
    
    async def _monitoring_loop(self):
        """Background monitoring loop"""
        while True:
            try:
                # Get scaling decision
                decision = await self.get_scaling_decision()
                
                # Apply scaling if needed
                if decision.action != "no_action":
                    await self.apply_scaling_decision(decision)
                
                # Clean up stale workers
                await self._cleanup_stale_workers()
                
                # Sleep before next check
                await asyncio.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {str(e)}")
                await asyncio.sleep(60)  # Wait longer on error
    
    async def _update_system_metrics(self):
        """Update system resource metrics"""
        try:
            # CPU usage
            self.system_metrics['cpu_usage'] = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            self.system_metrics['memory_usage'] = memory.percent
            
            # Disk usage
            disk = psutil.disk_usage('/')
            self.system_metrics['disk_usage'] = (disk.used / disk.total) * 100
            
            # Load average (Unix systems)
            try:
                load_avg = psutil.getloadavg()[0]  # 1-minute average
                cpu_count = psutil.cpu_count()
                self.system_metrics['load_average'] = load_avg / cpu_count
            except AttributeError:
                # Windows doesn't have getloadavg
                self.system_metrics['load_average'] = self.system_metrics['cpu_usage'] / 100.0
                
        except Exception as e:
            logger.error(f"Error updating system metrics: {str(e)}")
    
    async def _get_queue_size(self) -> int:
        """Get current job queue size"""
        # This would integrate with the job manager
        # For now, return a simulated value
        return 0
    
    async def _cleanup_stale_workers(self):
        """Remove workers that haven't sent heartbeat recently"""
        try:
            cutoff_time = datetime.utcnow() - timedelta(minutes=5)
            stale_workers = []
            
            for worker_id, metrics in self.worker_metrics.items():
                if metrics.last_heartbeat < cutoff_time:
                    stale_workers.append(worker_id)
            
            for worker_id in stale_workers:
                del self.worker_metrics[worker_id]
                logger.warning(f"Removed stale worker: {worker_id}")
                
                # Adjust current worker count
                if self.current_workers > self.min_workers:
                    self.current_workers -= 1
                
        except Exception as e:
            logger.error(f"Error cleaning up stale workers: {str(e)}")
    
    async def get_worker_metrics(self) -> Dict[str, Any]:
        """Get comprehensive worker and system metrics"""
        try:
            total_capacity = sum(w.max_concurrent_jobs for w in self.worker_metrics.values())
            current_load = sum(w.current_jobs for w in self.worker_metrics.values())
            
            metrics = {
                'current_workers': self.current_workers,
                'target_workers': self.target_workers,
                'total_capacity': total_capacity,
                'current_load': current_load,
                'load_percentage': (current_load / total_capacity * 100) if total_capacity > 0 else 0,
                'system_metrics': self.system_metrics.copy(),
                'worker_count_by_status': {
                    'idle': len([w for w in self.worker_metrics.values() if w.status == "idle"]),
                    'active': len([w for w in self.worker_metrics.values() if w.status == "active"]),
                    'busy': len([w for w in self.worker_metrics.values() if w.status == "busy"]),
                },
                'workers': {
                    worker_id: {
                        'status': metrics.status,
                        'current_jobs': metrics.current_jobs,
                        'max_concurrent_jobs': metrics.max_concurrent_jobs,
                        'cpu_usage': metrics.cpu_usage,
                        'memory_usage': metrics.memory_usage,
                        'jobs_completed': metrics.jobs_completed,
                        'jobs_failed': metrics.jobs_failed,
                        'average_processing_time': metrics.average_processing_time,
                        'last_heartbeat': metrics.last_heartbeat.isoformat()
                    }
                    for worker_id, metrics in self.worker_metrics.items()
                },
                'recent_scaling_decisions': [
                    {
                        'action': decision.action,
                        'target_workers': decision.target_workers,
                        'reason': decision.reason,
                        'timestamp': datetime.utcnow().isoformat()  # Would be actual timestamp
                    }
                    for decision in self.scale_history[-10:]
                ]
            }
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error getting worker metrics: {str(e)}")
            return {}
