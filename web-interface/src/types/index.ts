// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'admin' | 'user' | 'viewer';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

// File types
export interface FileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  isFolder: boolean;
  parentId: string | null;
  ownerId: string;
  tenantId: string;
  tags: string[];
  metadata: Record<string, string>;
  version: number;
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

export interface Folder extends FileItem {
  isFolder: true;
  childCount: number;
}

export interface FileUploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface ShareSettings {
  fileId: string;
  isPublic: boolean;
  expiresAt?: string;
  password?: string;
  allowDownload: boolean;
  sharedWith: SharedUser[];
}

export interface SharedUser {
  userId: string;
  email: string;
  permission: 'view' | 'edit' | 'admin';
}

// Notification types
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export type NotificationType =
  | 'file_uploaded'
  | 'file_processed'
  | 'file_shared'
  | 'processing_failed'
  | 'system_alert';

// Processing types
export interface ProcessingJob {
  id: string;
  fileId: string;
  type: ProcessingType;
  status: ProcessingStatus;
  progress: number;
  result?: ProcessingResult;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export type ProcessingType =
  | 'thumbnail'
  | 'compress'
  | 'convert'
  | 'extract_text'
  | 'virus_scan';

export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface ProcessingResult {
  outputFileId?: string;
  metadata?: Record<string, unknown>;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  pagination?: PaginationInfo;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationInfo;
}
