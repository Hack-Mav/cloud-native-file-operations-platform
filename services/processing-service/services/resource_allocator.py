import asyncio
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import logging
import heapq
from dataclasses import dataclass
from enum import Enum

from ..models import Job, JobPriority, ResourceAllocation
from ..config import Settings

logger = logging.getLogger(__name__)

class ResourceType(Enum):
    CPU = "cpu"
    MEMORY = "memory"
    DISK = "disk"
    NETWORK = "network"

@dataclass
class ResourceRequirement:
    cpu_cores: float
    memory_mb: float
    disk_mb: float
    network_mbps: float
    estimated_duration_seconds: int

@dataclass
class WorkerResource:
    worker_id: str
    available_cpu: float
    available_memory: float
    available_disk: float
    available_network: float
    max_cpu: float
    max_memory: float
    max_disk: float
    max_network: float

class ResourceAllocator:
    """Manages job prioritization and resource allocation across workers"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.job_queue = []  # Priority queue
        self.worker_resources: Dict[str, WorkerResource] = {}
        self.job_allocations: Dict[str, ResourceAllocation] = {}
        self.resource_history: List[Dict[str, Any]] = []
        
        # Priority weights
        self.priority_weights = {
            JobPriority.URGENT: 1000,
            JobPriority.HIGH: 100,
            JobPriority.MEDIUM: 10,
            JobPriority.LOW: 1
        }
        
        # Resource requirements by processing type
        self.processing_requirements = {
            'image_resize': ResourceRequirement(1.0, 512, 100, 10, 30),
            'image_format_convert': ResourceRequirement(1.5, 1024, 200, 10, 45),
            'document_text_extract': ResourceRequirement(0.5, 256, 50, 5, 60),
            'document_pdf_generate': ResourceRequirement(1.0, 512, 100, 5, 90),
            'video_thumbnail': ResourceRequirement(2.0, 2048, 500, 50, 120),
            'video_compress': ResourceRequirement(4.0, 4096, 1000, 100, 600),
            'content_analysis': ResourceRequirement(1.0, 1024, 100, 10, 180),
            'custom': ResourceRequirement(2.0, 2048, 500, 20, 300)
        }
        
        logger.info("Resource allocator initialized")
    
    async def register_worker(self, worker_id: str, resources: Dict[str, float]):
        """Register a worker with its available resources"""
        worker_resource = WorkerResource(
            worker_id=worker_id,
            available_cpu=resources.get('cpu', 2.0),
            available_memory=resources.get('memory', 4096),
            available_disk=resources.get('disk', 10000),
            available_network=resources.get('network', 100),
            max_cpu=resources.get('cpu', 2.0),
            max_memory=resources.get('memory', 4096),
            max_disk=resources.get('disk', 10000),
            max_network=resources.get('network', 100)
        )
        
        self.worker_resources[worker_id] = worker_resource
        logger.info(f"Registered worker {worker_id} with resources: CPU={worker_resource.max_cpu}, Memory={worker_resource.max_memory}MB")
    
    async def queue_job(self, job: Job, processing_types: List[str]):
        """Add job to priority queue with calculated priority score"""
        try:
            # Calculate priority score
            priority_score = self._calculate_priority_score(job, processing_types)
            
            # Create queue entry
            queue_entry = {
                'priority_score': priority_score,
                'job_id': job.job_id,
                'job': job,
                'processing_types': processing_types,
                'queued_at': datetime.utcnow()
            }
            
            # Add to priority queue (negative for max-heap behavior)
            heapq.heappush(self.job_queue, (-priority_score, queue_entry))
            
            logger.info(f"Queued job {job.job_id} with priority score {priority_score}")
            
        except Exception as e:
            logger.error(f"Error queuing job {job.job_id}: {str(e)}")
            raise
    
    async def allocate_resources(self, job_id: str) -> Optional[ResourceAllocation]:
        """Allocate resources for a job"""
        try:
            # Find job in queue
            queue_entry = None
            for i, (neg_score, entry) in enumerate(self.job_queue):
                if entry['job_id'] == job_id:
                    queue_entry = entry
                    break
            
            if not queue_entry:
                logger.error(f"Job {job_id} not found in queue")
                return None
            
            # Calculate total resource requirements
            total_requirements = self._calculate_total_requirements(queue_entry['processing_types'])
            
            # Find best worker
            best_worker = await self._find_best_worker(total_requirements)
            
            if not best_worker:
                logger.warning(f"No suitable worker found for job {job_id}")
                return None
            
            # Create allocation
            allocation = ResourceAllocation(
                job_id=job_id,
                worker_id=best_worker.worker_id,
                allocated_cpu=total_requirements.cpu_cores,
                allocated_memory=total_requirements.memory_mb,
                allocated_disk=total_requirements.disk_mb,
                estimated_duration=total_requirements.estimated_duration_seconds,
                priority_score=abs(queue_entry['priority_score'])
            )
            
            # Update worker resources
            worker = self.worker_resources[best_worker.worker_id]
            worker.available_cpu -= total_requirements.cpu_cores
            worker.available_memory -= total_requirements.memory_mb
            worker.available_disk -= total_requirements.disk_mb
            worker.available_network -= total_requirements.network_mbps
            
            # Store allocation
            self.job_allocations[job_id] = allocation
            
            # Remove from queue
            self.job_queue = [entry for entry in self.job_queue if entry[1]['job_id'] != job_id]
            heapq.heapify(self.job_queue)
            
            logger.info(f"Allocated resources for job {job_id} on worker {best_worker.worker_id}")
            
            return allocation
            
        except Exception as e:
            logger.error(f"Error allocating resources for job {job_id}: {str(e)}")
            return None
    
    async def release_resources(self, job_id: str):
        """Release resources allocated to a job"""
        try:
            allocation = self.job_allocations.get(job_id)
            if not allocation:
                logger.warning(f"No allocation found for job {job_id}")
                return
            
            worker = self.worker_resources.get(allocation.worker_id)
            if worker:
                # Release resources
                worker.available_cpu += allocation.allocated_cpu
                worker.available_memory += allocation.allocated_memory
                worker.available_disk += allocation.allocated_disk
                worker.available_network += allocation.allocated_disk  # Using disk as placeholder
                
                # Ensure we don't exceed maximum
                worker.available_cpu = min(worker.available_cpu, worker.max_cpu)
                worker.available_memory = min(worker.available_memory, worker.max_memory)
                worker.available_disk = min(worker.available_disk, worker.max_disk)
                worker.available_network = min(worker.available_network, worker.max_network)
                
                logger.info(f"Released resources for job {job_id} from worker {allocation.worker_id}")
            
            # Remove allocation
            del self.job_allocations[job_id]
            
        except Exception as e:
            logger.error(f"Error releasing resources for job {job_id}: {str(e)}")
    
    def _calculate_priority_score(self, job: Job, processing_types: List[str]) -> int:
        """Calculate priority score for a job"""
        try:
            # Base priority from job priority
            base_score = self.priority_weights.get(job.priority, 10)
            
            # Age factor (older jobs get higher priority)
            age_seconds = (datetime.utcnow() - job.created_at).total_seconds()
            age_factor = min(age_seconds / 3600, 10)  # Max 10 points for age
            
            # Processing complexity factor
            complexity_factor = 0
            for processing_type in processing_types:
                if processing_type in self.processing_requirements:
                    req = self.processing_requirements[processing_type]
                    complexity_factor += req.cpu_cores + (req.memory_mb / 1024)
            
            complexity_factor = min(complexity_factor, 20)  # Max 20 points for complexity
            
            # User priority boost (from metadata)
            user_boost = 0
            if job.metadata and 'user_priority' in job.metadata:
                user_boost = min(job.metadata['user_priority'], 50)
            
            # Total score
            total_score = int(base_score + age_factor + complexity_factor + user_boost)
            
            return total_score
            
        except Exception as e:
            logger.error(f"Error calculating priority score: {str(e)}")
            return 10  # Default low priority
    
    def _calculate_total_requirements(self, processing_types: List[str]) -> ResourceRequirement:
        """Calculate total resource requirements for multiple processing types"""
        try:
            total_cpu = 0
            total_memory = 0
            total_disk = 0
            total_network = 0
            max_duration = 0
            
            for processing_type in processing_types:
                if processing_type in self.processing_requirements:
                    req = self.processing_requirements[processing_type]
                    total_cpu += req.cpu_cores
                    total_memory += req.memory_mb
                    total_disk += req.disk_mb
                    total_network += req.network_mbps
                    max_duration = max(max_duration, req.estimated_duration_seconds)
            
            return ResourceRequirement(
                cpu_cores=total_cpu,
                memory_mb=total_memory,
                disk_mb=total_disk,
                network_mbps=total_network,
                estimated_duration_seconds=max_duration
            )
            
        except Exception as e:
            logger.error(f"Error calculating total requirements: {str(e)}")
            return self.processing_requirements['custom']
    
    async def _find_best_worker(self, requirements: ResourceRequirement) -> Optional[WorkerResource]:
        """Find the best worker for given resource requirements"""
        try:
            suitable_workers = []
            
            for worker in self.worker_resources.values():
                # Check if worker has sufficient resources
                if (worker.available_cpu >= requirements.cpu_cores and
                    worker.available_memory >= requirements.memory_mb and
                    worker.available_disk >= requirements.disk_mb and
                    worker.available_network >= requirements.network_mbps):
                    
                    # Calculate fit score (lower is better)
                    cpu_utilization = (worker.available_cpu - requirements.cpu_cores) / worker.max_cpu
                    memory_utilization = (worker.available_memory - requirements.memory_mb) / worker.max_memory
                    
                    # Prefer workers that will be well-utilized but not overloaded
                    fit_score = cpu_utilization + memory_utilization
                    suitable_workers.append((fit_score, worker))
            
            if not suitable_workers:
                return None
            
            # Sort by fit score (ascending) and return best fit
            suitable_workers.sort(key=lambda x: x[0])
            return suitable_workers[0][1]
            
        except Exception as e:
            logger.error(f"Error finding best worker: {str(e)}")
            return None
    
    async def get_next_job(self) -> Optional[str]:
        """Get next job ID from priority queue"""
        try:
            if not self.job_queue:
                return None
            
            _, queue_entry = self.job_queue[0]
            return queue_entry['job_id']
            
        except Exception as e:
            logger.error(f"Error getting next job: {str(e)}")
            return None
    
    async def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status"""
        try:
            # Count jobs by priority
            priority_counts = {priority: 0 for priority in JobPriority}
            
            queue_jobs = []
            for neg_score, entry in self.job_queue:
                job = entry['job']
                priority_counts[job.priority] += 1
                queue_jobs.append({
                    'job_id': job.job_id,
                    'priority': job.priority.value,
                    'priority_score': abs(neg_score),
                    'queued_at': entry['queued_at'].isoformat(),
                    'wait_time_seconds': (datetime.utcnow() - entry['queued_at']).total_seconds()
                })
            
            # Sort by priority score
            queue_jobs.sort(key=lambda x: x['priority_score'], reverse=True)
            
            return {
                'total_jobs': len(self.job_queue),
                'jobs_by_priority': {p.value: count for p, count in priority_counts.items()},
                'jobs': queue_jobs[:50],  # Return first 50 jobs
                'oldest_job_age_seconds': min([job['wait_time_seconds'] for job in queue_jobs], default=0),
                'average_wait_time_seconds': sum([job['wait_time_seconds'] for job in queue_jobs]) / len(queue_jobs) if queue_jobs else 0
            }
            
        except Exception as e:
            logger.error(f"Error getting queue status: {str(e)}")
            return {}
    
    async def get_resource_status(self) -> Dict[str, Any]:
        """Get current resource allocation status"""
        try:
            total_resources = {
                'cpu': sum(w.max_cpu for w in self.worker_resources.values()),
                'memory': sum(w.max_memory for w in self.worker_resources.values()),
                'disk': sum(w.max_disk for w in self.worker_resources.values()),
                'network': sum(w.max_network for w in self.worker_resources.values())
            }
            
            available_resources = {
                'cpu': sum(w.available_cpu for w in self.worker_resources.values()),
                'memory': sum(w.available_memory for w in self.worker_resources.values()),
                'disk': sum(w.available_disk for w in self.worker_resources.values()),
                'network': sum(w.available_network for w in self.worker_resources.values())
            }
            
            utilization = {
                'cpu': ((total_resources['cpu'] - available_resources['cpu']) / total_resources['cpu'] * 100) if total_resources['cpu'] > 0 else 0,
                'memory': ((total_resources['memory'] - available_resources['memory']) / total_resources['memory'] * 100) if total_resources['memory'] > 0 else 0,
                'disk': ((total_resources['disk'] - available_resources['disk']) / total_resources['disk'] * 100) if total_resources['disk'] > 0 else 0,
                'network': ((total_resources['network'] - available_resources['network']) / total_resources['network'] * 100) if total_resources['network'] > 0 else 0
            }
            
            active_allocations = len(self.job_allocations)
            
            return {
                'total_resources': total_resources,
                'available_resources': available_resources,
                'utilization_percent': utilization,
                'active_allocations': active_allocations,
                'worker_count': len(self.worker_resources),
                'workers': {
                    worker_id: {
                        'max_cpu': worker.max_cpu,
                        'available_cpu': worker.available_cpu,
                        'max_memory': worker.max_memory,
                        'available_memory': worker.available_memory,
                        'cpu_utilization': ((worker.max_cpu - worker.available_cpu) / worker.max_cpu * 100),
                        'memory_utilization': ((worker.max_memory - worker.available_memory) / worker.max_memory * 100)
                    }
                    for worker_id, worker in self.worker_resources.items()
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting resource status: {str(e)}")
            return {}
    
    async def rebalance_resources(self) -> Dict[str, Any]:
        """Rebalance resources by migrating jobs if beneficial"""
        try:
            rebalance_actions = []
            
            # Find jobs that could be moved to better workers
            for job_id, allocation in self.job_allocations.items():
                current_worker = self.worker_resources.get(allocation.worker_id)
                if not current_worker:
                    continue
                
                # Calculate current worker utilization
                current_utilization = (
                    (current_worker.max_cpu - current_worker.available_cpu) / current_worker.max_cpu +
                    (current_worker.max_memory - current_worker.available_memory) / current_worker.max_memory
                ) / 2
                
                # Find better worker
                requirements = ResourceRequirement(
                    cpu_cores=allocation.allocated_cpu,
                    memory_mb=allocation.allocated_memory,
                    disk_mb=allocation.allocated_disk,
                    network_mbps=allocation.allocated_disk,  # Placeholder
                    estimated_duration_seconds=allocation.estimated_duration
                )
                
                better_worker = await self._find_best_worker(requirements)
                
                if better_worker and better_worker.worker_id != allocation.worker_id:
                    # Calculate better worker utilization
                    better_utilization = (
                        (better_worker.max_cpu - better_worker.available_cpu + requirements.cpu_cores) / better_worker.max_cpu +
                        (better_worker.max_memory - better_worker.available_memory + requirements.memory_mb) / better_worker.max_memory
                    ) / 2
                    
                    # If better worker would have lower utilization, recommend migration
                    if better_utilization < current_utilization - 0.1:  # 10% improvement threshold
                        rebalance_actions.append({
                            'job_id': job_id,
                            'from_worker': allocation.worker_id,
                            'to_worker': better_worker.worker_id,
                            'current_utilization': current_utilization,
                            'proposed_utilization': better_utilization,
                            'improvement': current_utilization - better_utilization
                        })
            
            # Sort by improvement (descending)
            rebalance_actions.sort(key=lambda x: x['improvement'], reverse=True)
            
            return {
                'recommended_actions': rebalance_actions[:10],  # Top 10 recommendations
                'total_recommendations': len(rebalance_actions)
            }
            
        except Exception as e:
            logger.error(f"Error rebalancing resources: {str(e)}")
            return {'recommended_actions': [], 'total_recommendations': 0}
