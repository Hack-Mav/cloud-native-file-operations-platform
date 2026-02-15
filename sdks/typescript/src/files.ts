/**
 * Files Client
 */

import { HttpClient } from './http';
import {
  File,
  Folder,
  FileVersion,
  UploadOptions,
  UploadResult,
  DownloadOptions,
  DownloadResult,
  CreateFolderRequest,
  ShareLink,
  CreateShareOptions,
  PaginationParams,
  PaginatedResponse,
  SearchOptions,
} from './types';

export class FilesClient {
  constructor(private http: HttpClient) {}

  // File operations

  /**
   * List files
   */
  async list(
    params?: PaginationParams & { folderId?: string }
  ): Promise<PaginatedResponse<File>> {
    return this.http.get<PaginatedResponse<File>>('/files', { params });
  }

  /**
   * Get file by ID
   */
  async get(fileId: string): Promise<File> {
    return this.http.get<File>(`/files/${fileId}`);
  }

  /**
   * Initialize file upload
   */
  async initUpload(options: UploadOptions): Promise<UploadResult> {
    const response = await this.http.post<{
      uploadId: string;
      uploadUrl: string;
      chunkSize: number;
      expiresAt: string;
    }>('/files/upload', {
      filename: options.filename,
      size: options.size,
      mimeType: options.mimeType,
      folderId: options.folderId,
      metadata: options.metadata,
    });

    return {
      ...response,
      expiresAt: new Date(response.expiresAt),
    };
  }

  /**
   * Upload a file
   * Note: For browser environments, use FormData. For Node.js, use streams.
   */
  async upload(
    file: Blob | Buffer,
    options: UploadOptions
  ): Promise<File> {
    // Initialize upload
    const { uploadUrl, uploadId } = await this.initUpload(options);

    // For simple uploads, use the direct upload URL
    const formData = new FormData();
    formData.append('file', file as Blob, options.filename);

    // Upload the file
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': options.mimeType || 'application/octet-stream',
      },
    });

    // Complete the upload
    return this.completeUpload(uploadId);
  }

  /**
   * Complete an upload
   */
  async completeUpload(uploadId: string): Promise<File> {
    return this.http.post<File>(`/files/upload/${uploadId}/complete`);
  }

  /**
   * Abort an upload
   */
  async abortUpload(uploadId: string): Promise<void> {
    await this.http.delete(`/files/upload/${uploadId}`);
  }

  /**
   * Get download URL
   */
  async getDownloadUrl(
    fileId: string,
    options?: DownloadOptions
  ): Promise<DownloadResult> {
    const response = await this.http.get<{
      downloadUrl: string;
      expiresAt: string;
    }>(`/files/${fileId}/download`, {
      params: options,
    });

    return {
      downloadUrl: response.downloadUrl,
      expiresAt: new Date(response.expiresAt),
    };
  }

  /**
   * Download file (returns URL for redirect or fetch)
   */
  async download(
    fileId: string,
    options?: DownloadOptions
  ): Promise<string> {
    const { downloadUrl } = await this.getDownloadUrl(fileId, options);
    return downloadUrl;
  }

  /**
   * Update file metadata
   */
  async update(
    fileId: string,
    data: { name?: string; metadata?: Record<string, unknown> }
  ): Promise<File> {
    return this.http.patch<File>(`/files/${fileId}`, data);
  }

  /**
   * Move file to folder
   */
  async move(fileId: string, folderId: string): Promise<File> {
    return this.http.post<File>(`/files/${fileId}/move`, { folderId });
  }

  /**
   * Copy file
   */
  async copy(
    fileId: string,
    options?: { folderId?: string; name?: string }
  ): Promise<File> {
    return this.http.post<File>(`/files/${fileId}/copy`, options);
  }

  /**
   * Delete file
   */
  async delete(fileId: string): Promise<void> {
    await this.http.delete(`/files/${fileId}`);
  }

  /**
   * Restore deleted file
   */
  async restore(fileId: string): Promise<File> {
    return this.http.post<File>(`/files/${fileId}/restore`);
  }

  // Version operations

  /**
   * Get file versions
   */
  async getVersions(fileId: string): Promise<FileVersion[]> {
    return this.http.get<FileVersion[]>(`/files/${fileId}/versions`);
  }

  /**
   * Restore file to specific version
   */
  async restoreVersion(fileId: string, version: number): Promise<File> {
    return this.http.post<File>(`/files/${fileId}/versions/${version}/restore`);
  }

  // Search

  /**
   * Search files
   */
  async search(options: SearchOptions): Promise<PaginatedResponse<File>> {
    return this.http.get<PaginatedResponse<File>>('/files/search', {
      params: {
        ...options,
        createdAfter: options.createdAfter?.toISOString(),
        createdBefore: options.createdBefore?.toISOString(),
      },
    });
  }

  // Folder operations

  /**
   * List folders
   */
  async listFolders(parentId?: string): Promise<Folder[]> {
    return this.http.get<Folder[]>('/folders', {
      params: { parentId },
    });
  }

  /**
   * Get folder by ID
   */
  async getFolder(folderId: string): Promise<Folder> {
    return this.http.get<Folder>(`/folders/${folderId}`);
  }

  /**
   * Create folder
   */
  async createFolder(data: CreateFolderRequest): Promise<Folder> {
    return this.http.post<Folder>('/folders', data);
  }

  /**
   * Update folder
   */
  async updateFolder(folderId: string, data: { name: string }): Promise<Folder> {
    return this.http.patch<Folder>(`/folders/${folderId}`, data);
  }

  /**
   * Move folder
   */
  async moveFolder(folderId: string, parentId: string): Promise<Folder> {
    return this.http.post<Folder>(`/folders/${folderId}/move`, { parentId });
  }

  /**
   * Delete folder
   */
  async deleteFolder(folderId: string, recursive?: boolean): Promise<void> {
    await this.http.delete(`/folders/${folderId}`, {
      params: { recursive },
    });
  }

  // Sharing operations

  /**
   * Create share link
   */
  async createShare(options: CreateShareOptions): Promise<ShareLink> {
    const response = await this.http.post<{
      id: string;
      fileId: string;
      url: string;
      permissions: string;
      password: boolean;
      expiresAt?: string;
      accessCount: number;
      createdAt: string;
    }>(`/files/${options.fileId}/share`, {
      permissions: options.permissions,
      password: options.password,
      expiresAt: options.expiresAt?.toISOString(),
      maxAccesses: options.maxAccesses,
    });

    return {
      ...response,
      permissions: response.permissions as any,
      expiresAt: response.expiresAt ? new Date(response.expiresAt) : undefined,
      createdAt: new Date(response.createdAt),
    };
  }

  /**
   * List share links for a file
   */
  async listShares(fileId: string): Promise<ShareLink[]> {
    const response = await this.http.get<any[]>(`/files/${fileId}/shares`);
    return response.map((s) => ({
      ...s,
      expiresAt: s.expiresAt ? new Date(s.expiresAt) : undefined,
      createdAt: new Date(s.createdAt),
    }));
  }

  /**
   * Delete share link
   */
  async deleteShare(fileId: string, shareId: string): Promise<void> {
    await this.http.delete(`/files/${fileId}/shares/${shareId}`);
  }

  /**
   * Get file checksum
   */
  async getChecksum(fileId: string): Promise<{ checksum: string; algorithm: string }> {
    return this.http.get(`/files/${fileId}/checksum`);
  }

  /**
   * Verify file integrity
   */
  async verifyIntegrity(fileId: string): Promise<{
    valid: boolean;
    expectedChecksum: string;
    actualChecksum: string;
  }> {
    return this.http.post(`/files/${fileId}/verify`);
  }

  /**
   * Get storage usage
   */
  async getUsage(): Promise<{
    used: number;
    limit: number;
    percentage: number;
  }> {
    return this.http.get('/files/usage');
  }

  /**
   * Get recently accessed files
   */
  async getRecent(limit?: number): Promise<File[]> {
    return this.http.get<File[]>('/files/recent', {
      params: { limit },
    });
  }

  /**
   * Get starred/favorite files
   */
  async getStarred(): Promise<File[]> {
    return this.http.get<File[]>('/files/starred');
  }

  /**
   * Star/favorite a file
   */
  async star(fileId: string): Promise<void> {
    await this.http.post(`/files/${fileId}/star`);
  }

  /**
   * Unstar a file
   */
  async unstar(fileId: string): Promise<void> {
    await this.http.delete(`/files/${fileId}/star`);
  }
}
