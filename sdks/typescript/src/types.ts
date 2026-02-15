/**
 * SDK Types and Interfaces
 */

// Configuration
export interface FileOpsConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
  timeout?: number;
  retries?: number;
  onTokenRefresh?: (tokens: AuthTokens) => void | Promise<void>;
}

// Authentication
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  status: UserStatus;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'user' | 'viewer' | 'processor';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export interface MfaSetupResponse {
  secret: string;
  qrCode: string;
}

export interface MfaVerifyResponse {
  recoveryCodes: string[];
}

// Files
export interface File {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  checksum: string;
  version: number;
  status: FileStatus;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FileStatus = 'active' | 'processing' | 'quarantined' | 'deleted';

export interface UploadOptions {
  filename: string;
  size: number;
  mimeType?: string;
  folderId?: string;
  metadata?: Record<string, unknown>;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  uploadId: string;
  uploadUrl: string;
  chunkSize: number;
  expiresAt: Date;
}

export interface FileVersion {
  version: number;
  size: number;
  checksum: string;
  createdAt: Date;
  createdBy: string;
}

export interface DownloadOptions {
  version?: number;
}

export interface DownloadResult {
  downloadUrl: string;
  expiresAt: Date;
}

// Folders
export interface Folder {
  id: string;
  name: string;
  path: string;
  parentId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFolderRequest {
  name: string;
  parentId?: string;
}

// Sharing
export interface ShareLink {
  id: string;
  fileId: string;
  url: string;
  permissions: SharePermissions;
  password?: boolean;
  expiresAt?: Date;
  accessCount: number;
  createdAt: Date;
}

export type SharePermissions = 'view' | 'download' | 'edit';

export interface CreateShareOptions {
  fileId: string;
  permissions: SharePermissions;
  password?: string;
  expiresAt?: Date;
  maxAccesses?: number;
}

// Processing
export interface ProcessingJob {
  id: string;
  type: ProcessingType;
  status: JobStatus;
  fileId: string;
  progress: number;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export type ProcessingType =
  | 'image_resize'
  | 'document_convert'
  | 'video_transcode'
  | 'virus_scan'
  | 'content_analysis';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface CreateJobRequest {
  fileId: string;
  type: ProcessingType;
  options?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  webhookUrl?: string;
}

// Notifications
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, unknown>;
  createdAt: Date;
}

export type NotificationType =
  | 'file_uploaded'
  | 'file_shared'
  | 'processing_complete'
  | 'system_alert';

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  inApp: boolean;
  types: Record<NotificationType, boolean>;
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Search
export interface SearchOptions extends PaginationParams {
  query?: string;
  mimeType?: string;
  minSize?: number;
  maxSize?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  folderId?: string;
}

// Health
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: Date;
  services?: Record<string, ServiceHealth>;
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  data: T;
  requestId?: string;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: Date;
  };
}
