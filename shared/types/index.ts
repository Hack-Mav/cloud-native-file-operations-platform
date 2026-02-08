// Shared TypeScript types for Cloud-native File Operations Platform

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  preferences: UserPreferences;
  createdAt: Date;
  lastLoginAt?: Date;
  status: 'active' | 'inactive' | 'suspended';
}

export interface UserPreferences {
  notifications: NotificationPreferences;
  ui: UIPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
}

export interface UIPreferences {
  theme: 'light' | 'dark';
  language: string;
  timezone: string;
}

export interface FileEntity {
  id: string;
  name: string;
  size: number;
  contentType: string;
  checksum: string;
  uploadedAt: Date;
  uploadedBy: string;
  status: 'uploading' | 'uploaded' | 'processing' | 'ready' | 'error';
  metadata: FileMetadata;
  storage: StorageInfo;
  access: AccessInfo;
}

export interface FileMetadata {
  tags: string[];
  description?: string;
  customFields: Record<string, any>;
}

export interface StorageInfo {
  bucket: string;
  key: string;
  region: string;
}

export interface AccessInfo {
  visibility: 'private' | 'public' | 'shared';
  permissions: string[];
  sharedWith: string[];
}

export interface ProcessingJob {
  id: string;
  fileId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  parameters: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: Date;
  requestId: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  action: string;
  url?: string;
}

export interface Tenant {
  id: string;
  name: string;
  domain: string;
  settings: TenantSettings;
  usage: TenantUsage;
  createdAt: Date;
  status: 'active' | 'suspended' | 'inactive';
}

export interface TenantSettings {
  branding: BrandingSettings;
  features: FeatureSettings;
  limits: ResourceLimits;
}

export interface BrandingSettings {
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  customCss?: string;
}

export interface FeatureSettings {
  fileProcessing: boolean;
  advancedSearch: boolean;
  apiAccess: boolean;
  webhooks: boolean;
}

export interface ResourceLimits {
  maxStorageGB: number;
  maxUsers: number;
  maxApiCallsPerMonth: number;
  maxFileSize: number;
}

export interface TenantUsage {
  storageUsedGB: number;
  activeUsers: number;
  apiCallsThisMonth: number;
  filesUploaded: number;
}