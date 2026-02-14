import { apiClient } from './client';
import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import { demoFilesApi } from './demoApi';
import type {
  ApiResponse,
  FileItem,
  Folder,
  PaginatedResponse,
  ShareSettings,
} from '@/types';

export interface FileListParams {
  folderId?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  tags?: string[];
}

export interface CreateFolderParams {
  name: string;
  parentId?: string | null;
}

export interface MoveFilesParams {
  fileIds: string[];
  destinationFolderId: string | null;
}

export interface CopyFilesParams {
  fileIds: string[];
  destinationFolderId: string | null;
}

export const filesApi = {
  async listFiles(params: FileListParams = {}): Promise<ApiResponse<PaginatedResponse<FileItem>>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.listFiles(params);
    }
    
    const response = await apiClient.get<ApiResponse<PaginatedResponse<FileItem>>>(
      '/files',
      { params }
    );
    return response.data;
  },

  async getFile(fileId: string): Promise<ApiResponse<FileItem>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.getFile(fileId);
    }
    
    const response = await apiClient.get<ApiResponse<FileItem>>(
      `/files/${fileId}`
    );
    return response.data;
  },

  async uploadFile(
    file: File,
    folderId: string | null,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<FileItem>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.uploadFile(file, folderId, onProgress);
    }
    
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) {
      formData.append('folderId', folderId);
    }

    const response = await apiClient.post<ApiResponse<FileItem>>(
      '/files/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(progress);
          }
        },
      }
    );
    return response.data;
  },

  async uploadChunked(
    file: File,
    folderId: string | null,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<FileItem>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.uploadChunked(file, folderId, onProgress);
    }
    
    const chunkSize = config.upload.chunkSize;
    const totalChunks = Math.ceil(file.size / chunkSize);

    // Initialize upload
    const initResponse = await apiClient.post<ApiResponse<{ uploadId: string }>>(
      '/files/upload/init',
      {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        folderId,
        totalChunks,
      }
    );

    if (!initResponse.data.success || !initResponse.data.data) {
      throw new Error('Failed to initialize upload');
    }

    const { uploadId } = initResponse.data.data;

    // Upload chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append('chunk', chunk);
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', String(chunkIndex));

      await apiClient.post('/files/upload/chunk', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (onProgress) {
        const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        onProgress(progress);
      }
    }

    // Complete upload
    const completeResponse = await apiClient.post<ApiResponse<FileItem>>(
      '/files/upload/complete',
      { uploadId }
    );

    return completeResponse.data;
  },

  async deleteFile(fileId: string): Promise<ApiResponse<void>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.deleteFile(fileId);
    }
    
    const response = await apiClient.delete<ApiResponse<void>>(
      `/files/${fileId}`
    );
    return response.data;
  },

  async deleteFiles(fileIds: string[]): Promise<ApiResponse<void>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.deleteFiles(fileIds);
    }
    
    const response = await apiClient.post<ApiResponse<void>>(
      '/files/delete-batch',
      { fileIds }
    );
    return response.data;
  },

  async createFolder(params: CreateFolderParams): Promise<ApiResponse<Folder>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.createFolder(params);
    }
    
    const response = await apiClient.post<ApiResponse<Folder>>(
      '/files/folders',
      params
    );
    return response.data;
  },

  async renameFile(fileId: string, newName: string): Promise<ApiResponse<FileItem>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.renameFile(fileId, newName);
    }
    
    const response = await apiClient.patch<ApiResponse<FileItem>>(
      `/files/${fileId}`,
      { name: newName }
    );
    return response.data;
  },

  async moveFiles(params: MoveFilesParams): Promise<ApiResponse<void>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.moveFiles(params);
    }
    
    const response = await apiClient.post<ApiResponse<void>>(
      '/files/move',
      params
    );
    return response.data;
  },

  async copyFiles(params: CopyFilesParams): Promise<ApiResponse<void>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.copyFiles(params);
    }
    
    const response = await apiClient.post<ApiResponse<void>>(
      '/files/copy',
      params
    );
    return response.data;
  },

  async getDownloadUrl(fileId: string): Promise<ApiResponse<{ url: string }>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.getDownloadUrl(fileId);
    }
    
    const response = await apiClient.get<ApiResponse<{ url: string }>>(
      `/files/${fileId}/download`
    );
    return response.data;
  },

  async getPreviewUrl(fileId: string): Promise<ApiResponse<{ url: string }>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.getPreviewUrl(fileId);
    }
    
    const response = await apiClient.get<ApiResponse<{ url: string }>>(
      `/files/${fileId}/preview`
    );
    return response.data;
  },

  async addTags(fileId: string, tags: string[]): Promise<ApiResponse<FileItem>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.addTags(fileId, tags);
    }
    
    const response = await apiClient.post<ApiResponse<FileItem>>(
      `/files/${fileId}/tags`,
      { tags }
    );
    return response.data;
  },

  async removeTags(fileId: string, tags: string[]): Promise<ApiResponse<FileItem>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.removeTags(fileId, tags);
    }
    
    const response = await apiClient.delete<ApiResponse<FileItem>>(
      `/files/${fileId}/tags`,
      { data: { tags } }
    );
    return response.data;
  },

  async getShareSettings(fileId: string): Promise<ApiResponse<ShareSettings>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.getShareSettings(fileId);
    }
    
    const response = await apiClient.get<ApiResponse<ShareSettings>>(
      `/files/${fileId}/share`
    );
    return response.data;
  },

  async updateShareSettings(
    fileId: string,
    settings: Partial<ShareSettings>
  ): Promise<ApiResponse<ShareSettings>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.updateShareSettings(fileId, settings);
    }
    
    const response = await apiClient.patch<ApiResponse<ShareSettings>>(
      `/files/${fileId}/share`,
      settings
    );
    return response.data;
  },

  async shareWithUser(
    fileId: string,
    email: string,
    permission: 'view' | 'edit' | 'admin'
  ): Promise<ApiResponse<ShareSettings>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.shareWithUser(fileId, email, permission);
    }
    
    const response = await apiClient.post<ApiResponse<ShareSettings>>(
      `/files/${fileId}/share/users`,
      { email, permission }
    );
    return response.data;
  },

  async removeUserShare(fileId: string, userId: string): Promise<ApiResponse<void>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.removeUserShare(fileId, userId);
    }
    
    const response = await apiClient.delete<ApiResponse<void>>(
      `/files/${fileId}/share/users/${userId}`
    );
    return response.data;
  },

  async getVersions(fileId: string): Promise<ApiResponse<FileItem[]>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.getVersions(fileId);
    }
    
    const response = await apiClient.get<ApiResponse<FileItem[]>>(
      `/files/${fileId}/versions`
    );
    return response.data;
  },

  async restoreVersion(fileId: string, version: number): Promise<ApiResponse<FileItem>> {
    const { isDemoMode } = useAuthStore.getState();
    if (isDemoMode) {
      return demoFilesApi.restoreVersion(fileId, version);
    }
    
    const response = await apiClient.post<ApiResponse<FileItem>>(
      `/files/${fileId}/versions/${version}/restore`
    );
    return response.data;
  },
};
