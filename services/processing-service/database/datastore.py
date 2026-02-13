import json
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging
from google.cloud import datastore

from ..models import Job, JobStatus, BatchJob

logger = logging.getLogger(__name__)

class DatastoreClient:
    """Google Cloud Datastore client for job and batch job persistence"""
    
    def __init__(self, project_id: str, namespace: str = "processing-service"):
        self.project_id = project_id
        self.namespace = namespace
        self.client = datastore.Client(project=project_id, namespace=namespace)
        
        # Kind names
        self.JOB_KIND = "ProcessingJob"
        self.BATCH_JOB_KIND = "BatchJob"
    
    async def save_job(self, job: Job) -> bool:
        """Save job to datastore"""
        try:
            key = self.client.key(self.JOB_KIND, job.job_id)
            
            # Convert job to dict
            job_dict = job.dict()
            
            # Handle datetime serialization
            if job_dict.get('created_at'):
                job_dict['created_at'] = job.created_at
            if job_dict.get('started_at'):
                job_dict['started_at'] = job.started_at
            if job_dict.get('completed_at'):
                job_dict['completed_at'] = job.completed_at
            
            # Handle nested objects
            if job_dict.get('progress'):
                job_dict['progress'] = job.progress.dict() if job.progress else None
            
            if job_dict.get('result'):
                job_dict['result'] = job.result.dict() if job.result else None
            
            if job_dict.get('custom_pipeline'):
                job_dict['custom_pipeline'] = job.custom_pipeline.dict() if job.custom_pipeline else None
            
            entity = datastore.Entity(key=key)
            entity.update(job_dict)
            
            self.client.put(entity)
            return True
            
        except Exception as e:
            logger.error(f"Error saving job {job.job_id}: {str(e)}")
            return False
    
    async def get_job(self, job_id: str) -> Optional[Job]:
        """Get job from datastore"""
        try:
            key = self.client.key(self.JOB_KIND, job_id)
            entity = self.client.get(key)
            
            if not entity:
                return None
            
            return self._entity_to_job(entity)
            
        except Exception as e:
            logger.error(f"Error getting job {job_id}: {str(e)}")
            return None
    
    async def query_jobs(
        self, 
        status: Optional[JobStatus], 
        limit: int = 100, 
        offset: int = 0
    ) -> List[Job]:
        """Query jobs from datastore"""
        try:
            query = self.client.query(kind=self.JOB_KIND)
            
            if status:
                query.add_filter('status', '=', status.value)
            
            query.order = ['-created_at']
            query.limit = limit
            query.offset = offset
            
            results = list(query.fetch())
            
            jobs = []
            for entity in results:
                job = self._entity_to_job(entity)
                if job:
                    jobs.append(job)
            
            return jobs
            
        except Exception as e:
            logger.error(f"Error querying jobs: {str(e)}")
            return []
    
    async def delete_job(self, job_id: str) -> bool:
        """Delete job from datastore"""
        try:
            key = self.client.key(self.JOB_KIND, job_id)
            self.client.delete(key)
            return True
            
        except Exception as e:
            logger.error(f"Error deleting job {job_id}: {str(e)}")
            return False
    
    async def save_batch_job(self, batch_job: BatchJob) -> bool:
        """Save batch job to datastore"""
        try:
            key = self.client.key(self.BATCH_JOB_KIND, batch_job.batch_id)
            
            # Convert batch job to dict
            batch_job_dict = batch_job.dict()
            
            # Handle datetime serialization
            if batch_job_dict.get('created_at'):
                batch_job_dict['created_at'] = batch_job.created_at
            if batch_job_dict.get('started_at'):
                batch_job_dict['started_at'] = batch_job.started_at
            if batch_job_dict.get('completed_at'):
                batch_job_dict['completed_at'] = batch_job.completed_at
            
            # Handle nested objects
            if batch_job_dict.get('progress'):
                batch_job_dict['progress'] = batch_job.progress.dict() if batch_job.progress else None
            
            if batch_job_dict.get('result'):
                batch_job_dict['result'] = batch_job.result.dict() if batch_job.result else None
            
            if batch_job_dict.get('custom_pipeline'):
                batch_job_dict['custom_pipeline'] = batch_job.custom_pipeline.dict() if batch_job.custom_pipeline else None
            
            entity = datastore.Entity(key=key)
            entity.update(batch_job_dict)
            
            self.client.put(entity)
            return True
            
        except Exception as e:
            logger.error(f"Error saving batch job {batch_job.batch_id}: {str(e)}")
            return False
    
    async def get_batch_job(self, batch_id: str) -> Optional[BatchJob]:
        """Get batch job from datastore"""
        try:
            key = self.client.key(self.BATCH_JOB_KIND, batch_id)
            entity = self.client.get(key)
            
            if not entity:
                return None
            
            return self._entity_to_batch_job(entity)
            
        except Exception as e:
            logger.error(f"Error getting batch job {batch_id}: {str(e)}")
            return None
    
    async def query_batch_jobs(
        self, 
        status: Optional[JobStatus], 
        limit: int = 100, 
        offset: int = 0
    ) -> List[BatchJob]:
        """Query batch jobs from datastore"""
        try:
            query = self.client.query(kind=self.BATCH_JOB_KIND)
            
            if status:
                query.add_filter('status', '=', status.value)
            
            query.order = ['-created_at']
            query.limit = limit
            query.offset = offset
            
            results = list(query.fetch())
            
            batch_jobs = []
            for entity in results:
                batch_job = self._entity_to_batch_job(entity)
                if batch_job:
                    batch_jobs.append(batch_job)
            
            return batch_jobs
            
        except Exception as e:
            logger.error(f"Error querying batch jobs: {str(e)}")
            return []
    
    def _entity_to_job(self, entity: datastore.Entity) -> Optional[Job]:
        """Convert datastore entity to Job object"""
        try:
            data = dict(entity)
            
            # Handle datetime deserialization
            if data.get('created_at'):
                if isinstance(data['created_at'], datetime):
                    data['created_at'] = data['created_at']
            
            if data.get('started_at'):
                if isinstance(data['started_at'], datetime):
                    data['started_at'] = data['started_at']
            
            if data.get('completed_at'):
                if isinstance(data['completed_at'], datetime):
                    data['completed_at'] = data['completed_at']
            
            # Handle nested objects
            if data.get('progress'):
                from ..models import JobProgress
                data['progress'] = JobProgress(**data['progress'])
            
            if data.get('result'):
                from ..models import JobResult
                data['result'] = JobResult(**data['result'])
            
            if data.get('custom_pipeline'):
                from ..models import ProcessingPipeline
                data['custom_pipeline'] = ProcessingPipeline(**data['custom_pipeline'])
            
            return Job(**data)
            
        except Exception as e:
            logger.error(f"Error converting entity to job: {str(e)}")
            return None
    
    def _entity_to_batch_job(self, entity: datastore.Entity) -> Optional[BatchJob]:
        """Convert datastore entity to BatchJob object"""
        try:
            data = dict(entity)
            
            # Handle datetime deserialization
            if data.get('created_at'):
                if isinstance(data['created_at'], datetime):
                    data['created_at'] = data['created_at']
            
            if data.get('started_at'):
                if isinstance(data['started_at'], datetime):
                    data['started_at'] = data['started_at']
            
            if data.get('completed_at'):
                if isinstance(data['completed_at'], datetime):
                    data['completed_at'] = data['completed_at']
            
            # Handle nested objects
            if data.get('progress'):
                from ..models import BatchJobProgress
                data['progress'] = BatchJobProgress(**data['progress'])
            
            if data.get('result'):
                from ..models import BatchJobResult
                data['result'] = BatchJobResult(**data['result'])
            
            if data.get('custom_pipeline'):
                from ..models import ProcessingPipeline
                data['custom_pipeline'] = ProcessingPipeline(**data['custom_pipeline'])
            
            return BatchJob(**data)
            
        except Exception as e:
            logger.error(f"Error converting entity to batch job: {str(e)}")
            return None
    
    async def close(self):
        """Close datastore client"""
        try:
            self.client.close()
        except Exception as e:
            logger.error(f"Error closing datastore client: {str(e)}")
