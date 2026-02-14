import { useAuthStore } from '@/store/authStore';
import {
  getDemoFiles,
  getDemoFileById,
  createDemoPaginatedResponse,
  createDemoShareSettings,
  demoNotifications,
  demoProcessingJobs,
} from './demoData';
import type {
  ApiResponse,
  FileItem,
  Folder,
  ShareSettings,
  PaginatedResponse,
  ProcessingJob,
  Notification,
} from '@/types';

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

export interface FileListParams {
  folderId?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  tags?: string[];
}

// Demo API functions
export const demoFilesApi = {
  async listFiles(params: FileListParams = {}): Promise<ApiResponse<PaginatedResponse<FileItem>>> {
    const { folderId, page = 1, pageSize = 20, search, tags } = params;
    
    let files = getDemoFiles(folderId);
    
    // Apply search filter
    if (search) {
      files = files.filter(file => 
        file.name.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Apply tags filter
    if (tags && tags.length > 0) {
      files = files.filter(file =>
        tags.some(tag => file.tags.includes(tag))
      );
    }
    
    // Apply sorting
    const sortBy = params.sortBy || 'name';
    const sortOrder = params.sortOrder || 'asc';
    files.sort((a, b) => {
      const aValue = a[sortBy as keyof FileItem];
      const bValue = b[sortBy as keyof FileItem];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
    
    return createDemoPaginatedResponse(files, page, pageSize);
  },

  async getFile(fileId: string): Promise<ApiResponse<FileItem>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    return {
      success: true,
      data: file,
    };
  },

  async uploadFile(
    file: File,
    folderId: string | null,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<FileItem>> {
    // Simulate upload progress
    if (onProgress) {
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        onProgress(i);
      }
    }
    
    const newFile: FileItem = {
      id: `file-${Date.now()}`,
      name: file.name,
      path: folderId ? `/folder-${folderId}/${file.name}` : `/${file.name}`,
      size: file.size,
      mimeType: file.type,
      isFolder: false,
      parentId: folderId || null,
      ownerId: useAuthStore.getState().user?.id || 'demo-user-id',
      tenantId: useAuthStore.getState().user?.tenantId || 'demo-tenant',
      tags: [],
      metadata: {},
      version: 1,
      checksum: `demo-checksum-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    return {
      success: true,
      data: newFile,
    };
  },

  async uploadChunked(
    file: File,
    folderId: string | null,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<FileItem>> {
    // Simulate chunked upload
    return this.uploadFile(file, folderId, onProgress);
  },

  async deleteFile(fileId: string): Promise<ApiResponse<void>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    return {
      success: true,
    };
  },

  async deleteFiles(_fileIds: string[]): Promise<ApiResponse<void>> {
    // Simulate batch delete
    return {
      success: true,
    };
  },

  async createFolder(params: CreateFolderParams): Promise<ApiResponse<Folder>> {
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: params.name,
      path: params.parentId ? `/folder-${params.parentId}/${params.name}` : `/${params.name}`,
      size: 0,
      mimeType: 'application/vnd.google-apps.folder',
      isFolder: true,
      parentId: params.parentId || null,
      ownerId: useAuthStore.getState().user?.id || 'demo-user-id',
      tenantId: useAuthStore.getState().user?.tenantId || 'demo-tenant',
      tags: [],
      metadata: {},
      version: 1,
      checksum: '',
      childCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    return {
      success: true,
      data: newFolder,
    };
  },

  async renameFile(fileId: string, newName: string): Promise<ApiResponse<FileItem>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    const updatedFile = {
      ...file,
      name: newName,
      updatedAt: new Date().toISOString(),
    };
    
    return {
      success: true,
      data: updatedFile,
    };
  },

  async moveFiles(_params: MoveFilesParams): Promise<ApiResponse<void>> {
    return {
      success: true,
    };
  },

  async copyFiles(_params: CopyFilesParams): Promise<ApiResponse<void>> {
    return {
      success: true,
    };
  },

  async getDownloadUrl(fileId: string): Promise<ApiResponse<{ url: string }>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    return {
      success: true,
      data: {
        url: `https://demo-cdn.example.com/files/${fileId}`,
      },
    };
  },

  async getPreviewUrl(fileId: string): Promise<ApiResponse<{ url: string }>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    return {
      success: true,
      data: {
        url: `https://demo-cdn.example.com/previews/${fileId}`,
      },
    };
  },

  async addTags(fileId: string, tags: string[]): Promise<ApiResponse<FileItem>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    const updatedFile = {
      ...file,
      tags: [...new Set([...file.tags, ...tags])],
      updatedAt: new Date().toISOString(),
    };
    
    return {
      success: true,
      data: updatedFile,
    };
  },

  async removeTags(fileId: string, tags: string[]): Promise<ApiResponse<FileItem>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    const updatedFile = {
      ...file,
      tags: file.tags.filter(tag => !tags.includes(tag)),
      updatedAt: new Date().toISOString(),
    };
    
    return {
      success: true,
      data: updatedFile,
    };
  },

  async getShareSettings(fileId: string): Promise<ApiResponse<ShareSettings>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    return {
      success: true,
      data: createDemoShareSettings(fileId),
    };
  },

  async updateShareSettings(
    fileId: string,
    settings: Partial<ShareSettings>
  ): Promise<ApiResponse<ShareSettings>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    const updatedSettings = {
      ...createDemoShareSettings(fileId),
      ...settings,
    };
    
    return {
      success: true,
      data: updatedSettings,
    };
  },

  async shareWithUser(
    fileId: string,
    email: string,
    permission: 'view' | 'edit' | 'admin'
  ): Promise<ApiResponse<ShareSettings>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    const settings = createDemoShareSettings(fileId);
    settings.sharedWith.push({
      userId: `user-${Date.now()}`,
      email,
      permission,
    });
    
    return {
      success: true,
      data: settings,
    };
  },

  async removeUserShare(_fileId: string, _userId: string): Promise<ApiResponse<void>> {
    return {
      success: true,
    };
  },

  async getVersions(fileId: string): Promise<ApiResponse<FileItem[]>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    // Return mock versions
    const versions = [
      { ...file, version: 1, createdAt: '2024-01-20T09:15:00Z' },
      { ...file, version: 2, createdAt: '2024-01-21T14:30:00Z' },
      { ...file, version: 3, createdAt: '2024-01-22T16:45:00Z' },
    ];
    
    return {
      success: true,
      data: versions,
    };
  },

  async restoreVersion(fileId: string, version: number): Promise<ApiResponse<FileItem>> {
    const file = getDemoFileById(fileId);
    
    if (!file) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }
    
    const restoredFile = {
      ...file,
      version: version + 1,
      updatedAt: new Date().toISOString(),
    };
    
    return {
      success: true,
      data: restoredFile,
    };
  },
};

// Demo notifications API
export const demoNotificationsApi = {
  async getNotifications(): Promise<ApiResponse<Notification[]>> {
    return {
      success: true,
      data: demoNotifications,
    };
  },

  async markAsRead(_notificationId: string): Promise<ApiResponse<void>> {
    return {
      success: true,
    };
  },

  async markAllAsRead(): Promise<ApiResponse<void>> {
    return {
      success: true,
    };
  },
};

// Demo processing jobs API
export const demoProcessingApi = {
  async getJobs(): Promise<ApiResponse<ProcessingJob[]>> {
    return {
      success: true,
      data: demoProcessingJobs,
    };
  },

  async getJob(jobId: string): Promise<ApiResponse<ProcessingJob>> {
    const job = demoProcessingJobs.find(j => j.id === jobId);
    
    if (!job) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found',
        },
      };
    }
    
    return {
      success: true,
      data: job,
    };
  },
};
