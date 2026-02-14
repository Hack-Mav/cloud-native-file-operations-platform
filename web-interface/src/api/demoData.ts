import type {
  FileItem,
  PaginatedResponse,
  ShareSettings,
  ApiResponse,
  User,
  Notification,
  ProcessingJob,
} from '@/types';

// Demo user
export const demoUser: User = {
  id: 'demo-user-id',
  email: 'demo@example.com',
  name: 'Demo User',
  role: 'admin',
  tenantId: 'demo-tenant',
  mfaEnabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Demo files and folders
const demoFiles: FileItem[] = [
  {
    id: 'folder-1',
    name: 'Documents',
    path: '/Documents',
    size: 0,
    mimeType: 'application/vnd.google-apps.folder',
    isFolder: true,
    parentId: null,
    ownerId: demoUser.id,
    tenantId: demoUser.tenantId,
    tags: ['work', 'important'],
    metadata: {},
    version: 1,
    checksum: '',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'folder-2',
    name: 'Images',
    path: '/Images',
    size: 0,
    mimeType: 'application/vnd.google-apps.folder',
    isFolder: true,
    parentId: null,
    ownerId: demoUser.id,
    tenantId: demoUser.tenantId,
    tags: ['media'],
    metadata: {},
    version: 1,
    checksum: '',
    createdAt: '2024-01-16T14:30:00Z',
    updatedAt: '2024-01-16T14:30:00Z',
  },
  {
    id: 'file-1',
    name: 'Project Proposal.pdf',
    path: '/Documents/Project Proposal.pdf',
    size: 2048576,
    mimeType: 'application/pdf',
    isFolder: false,
    parentId: 'folder-1',
    ownerId: demoUser.id,
    tenantId: demoUser.tenantId,
    tags: ['proposal', 'work'],
    metadata: { author: 'Demo User', pages: '12' },
    version: 3,
    checksum: 'abc123def456',
    createdAt: '2024-01-20T09:15:00Z',
    updatedAt: '2024-01-22T16:45:00Z',
  },
  {
    id: 'file-2',
    name: 'Budget Spreadsheet.xlsx',
    path: '/Documents/Budget Spreadsheet.xlsx',
    size: 1024000,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    isFolder: false,
    parentId: 'folder-1',
    ownerId: demoUser.id,
    tenantId: demoUser.tenantId,
    tags: ['finance', '2024'],
    metadata: { sheets: '5', lastModified: '2024-01-25' },
    version: 2,
    checksum: 'def456ghi789',
    createdAt: '2024-01-18T11:30:00Z',
    updatedAt: '2024-01-25T13:20:00Z',
  },
  {
    id: 'file-3',
    name: 'Team Photo.jpg',
    path: '/Images/Team Photo.jpg',
    size: 3072000,
    mimeType: 'image/jpeg',
    isFolder: false,
    parentId: 'folder-2',
    ownerId: demoUser.id,
    tenantId: demoUser.tenantId,
    tags: ['team', 'event'],
    metadata: { resolution: '1920x1080', camera: 'Demo Camera' },
    version: 1,
    checksum: 'ghi789jkl012',
    createdAt: '2024-01-10T15:45:00Z',
    updatedAt: '2024-01-10T15:45:00Z',
  },
  {
    id: 'file-4',
    name: 'Presentation.pptx',
    path: '/Presentation.pptx',
    size: 5120000,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    isFolder: false,
    parentId: null,
    ownerId: demoUser.id,
    tenantId: demoUser.tenantId,
    tags: ['presentation', 'meeting'],
    metadata: { slides: '25', duration: '45min' },
    version: 4,
    checksum: 'jkl012mno345',
    createdAt: '2024-01-05T08:00:00Z',
    updatedAt: '2024-01-26T10:30:00Z',
  },
];

// Demo notifications
export const demoNotifications: Notification[] = [
  {
    id: 'notif-1',
    type: 'file_uploaded',
    title: 'File uploaded successfully',
    message: 'Project Proposal.pdf has been uploaded to Documents',
    read: false,
    createdAt: '2024-01-26T10:30:00Z',
  },
  {
    id: 'notif-2',
    type: 'file_shared',
    title: 'File shared with you',
    message: 'Budget Spreadsheet.xlsx has been shared by John Doe',
    read: true,
    createdAt: '2024-01-25T14:15:00Z',
  },
  {
    id: 'notif-3',
    type: 'system_alert',
    title: 'System maintenance',
    message: 'Scheduled maintenance will occur on January 30, 2024',
    read: false,
    createdAt: '2024-01-24T09:00:00Z',
  },
];

// Demo processing jobs
export const demoProcessingJobs: ProcessingJob[] = [
  {
    id: 'job-1',
    fileId: 'file-3',
    type: 'thumbnail',
    status: 'completed',
    progress: 100,
    result: { outputFileId: 'thumb-file-3' },
    createdAt: '2024-01-10T15:46:00Z',
    completedAt: '2024-01-10T15:47:00Z',
  },
  {
    id: 'job-2',
    fileId: 'file-1',
    type: 'virus_scan',
    status: 'processing',
    progress: 75,
    createdAt: '2024-01-26T10:31:00Z',
  },
];

// Helper functions for demo data
export function getDemoFiles(folderId?: string | null): FileItem[] {
  if (!folderId) {
    return demoFiles.filter(file => file.parentId === null);
  }
  return demoFiles.filter(file => file.parentId === folderId);
}

export function getDemoFileById(fileId: string): FileItem | undefined {
  return demoFiles.find(file => file.id === fileId);
}

export function createDemoPaginatedResponse<T>(
  items: T[],
  page: number = 1,
  pageSize: number = 20
): ApiResponse<PaginatedResponse<T>> {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedItems = items.slice(startIndex, endIndex);

  return {
    success: true,
    data: {
      items: paginatedItems,
      pagination: {
        page,
        pageSize,
        total: items.length,
        totalPages: Math.ceil(items.length / pageSize),
      },
    },
  };
}

export function createDemoShareSettings(fileId: string): ShareSettings {
  return {
    fileId,
    isPublic: false,
    allowDownload: true,
    sharedWith: [
      {
        userId: 'user-2',
        email: 'john.doe@example.com',
        permission: 'view',
      },
    ],
  };
}
