/**
 * Processing Client
 */

import { HttpClient } from './http';
import {
  ProcessingJob,
  CreateJobRequest,
  PaginationParams,
  PaginatedResponse,
  JobStatus,
  ProcessingType,
} from './types';

export class ProcessingClient {
  constructor(private http: HttpClient) {}

  /**
   * Create a processing job
   */
  async createJob(request: CreateJobRequest): Promise<ProcessingJob> {
    const response = await this.http.post<any>('/processing/jobs', request);
    return this.transformJob(response);
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<ProcessingJob> {
    const response = await this.http.get<any>(`/processing/jobs/${jobId}`);
    return this.transformJob(response);
  }

  /**
   * List jobs
   */
  async listJobs(
    params?: PaginationParams & {
      status?: JobStatus;
      type?: ProcessingType;
      fileId?: string;
    }
  ): Promise<PaginatedResponse<ProcessingJob>> {
    const response = await this.http.get<PaginatedResponse<any>>(
      '/processing/jobs',
      { params }
    );

    return {
      ...response,
      data: response.data.map(this.transformJob),
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<ProcessingJob> {
    const response = await this.http.delete<any>(`/processing/jobs/${jobId}`);
    return this.transformJob(response);
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<ProcessingJob> {
    const response = await this.http.post<any>(`/processing/jobs/${jobId}/retry`);
    return this.transformJob(response);
  }

  /**
   * Wait for job completion
   */
  async waitForCompletion(
    jobId: string,
    options?: {
      pollInterval?: number;
      timeout?: number;
      onProgress?: (job: ProcessingJob) => void;
    }
  ): Promise<ProcessingJob> {
    const pollInterval = options?.pollInterval || 1000;
    const timeout = options?.timeout || 300000; // 5 minutes default
    const startTime = Date.now();

    while (true) {
      const job = await this.getJob(jobId);

      if (options?.onProgress) {
        options.onProgress(job);
      }

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return job;
      }

      if (Date.now() - startTime > timeout) {
        throw new Error(`Job ${jobId} did not complete within timeout`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // Convenience methods for common processing types

  /**
   * Resize an image
   */
  async resizeImage(
    fileId: string,
    options: {
      width?: number;
      height?: number;
      maintainAspectRatio?: boolean;
      format?: 'jpeg' | 'png' | 'webp';
      quality?: number;
    }
  ): Promise<ProcessingJob> {
    return this.createJob({
      fileId,
      type: 'image_resize',
      options,
    });
  }

  /**
   * Convert document format
   */
  async convertDocument(
    fileId: string,
    options: {
      targetFormat: 'pdf' | 'docx' | 'txt' | 'html';
      includeImages?: boolean;
      preserveFormatting?: boolean;
    }
  ): Promise<ProcessingJob> {
    return this.createJob({
      fileId,
      type: 'document_convert',
      options,
    });
  }

  /**
   * Transcode video
   */
  async transcodeVideo(
    fileId: string,
    options: {
      targetFormat: 'mp4' | 'webm' | 'avi';
      resolution?: '720p' | '1080p' | '4k';
      codec?: 'h264' | 'h265' | 'vp9';
      bitrate?: number;
    }
  ): Promise<ProcessingJob> {
    return this.createJob({
      fileId,
      type: 'video_transcode',
      options,
    });
  }

  /**
   * Scan file for viruses
   */
  async scanForViruses(fileId: string): Promise<ProcessingJob> {
    return this.createJob({
      fileId,
      type: 'virus_scan',
      priority: 'high',
    });
  }

  /**
   * Analyze file content
   */
  async analyzeContent(
    fileId: string,
    options?: {
      extractText?: boolean;
      detectLanguage?: boolean;
      extractEntities?: boolean;
      classifyContent?: boolean;
    }
  ): Promise<ProcessingJob> {
    return this.createJob({
      fileId,
      type: 'content_analysis',
      options,
    });
  }

  // Batch operations

  /**
   * Create batch processing jobs
   */
  async createBatchJobs(
    jobs: CreateJobRequest[]
  ): Promise<{ jobs: ProcessingJob[]; failed: Array<{ index: number; error: string }> }> {
    const response = await this.http.post<{
      jobs: any[];
      failed: Array<{ index: number; error: string }>;
    }>('/processing/jobs/batch', { jobs });

    return {
      jobs: response.jobs.map(this.transformJob),
      failed: response.failed,
    };
  }

  /**
   * Cancel multiple jobs
   */
  async cancelBatchJobs(jobIds: string[]): Promise<{
    cancelled: string[];
    failed: Array<{ jobId: string; error: string }>;
  }> {
    return this.http.post('/processing/jobs/batch/cancel', { jobIds });
  }

  /**
   * Get job statistics
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<JobStatus, number>;
    byType: Record<ProcessingType, number>;
    averageProcessingTime: number;
  }> {
    return this.http.get('/processing/stats');
  }

  /**
   * Get job result
   */
  async getJobResult<T = unknown>(jobId: string): Promise<T> {
    const job = await this.getJob(jobId);

    if (job.status !== 'completed') {
      throw new Error(`Job ${jobId} is not completed (status: ${job.status})`);
    }

    return job.result as T;
  }

  /**
   * Get output file from job
   */
  async getOutputFile(jobId: string): Promise<string> {
    const result = await this.getJobResult<{ outputFileId: string }>(jobId);
    return result.outputFileId;
  }

  /**
   * Transform raw job response to ProcessingJob
   */
  private transformJob(raw: any): ProcessingJob {
    return {
      ...raw,
      createdAt: new Date(raw.createdAt),
      completedAt: raw.completedAt ? new Date(raw.completedAt) : undefined,
    };
  }
}
