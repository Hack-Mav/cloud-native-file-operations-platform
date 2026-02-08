// Shared constants for Cloud-native File Operations Platform

export const API_ENDPOINTS = {
  AUTH: '/api/auth',
  FILES: '/api/files',
  PROCESSING: '/api/processing',
  NOTIFICATIONS: '/api/notifications',
  TENANTS: '/api/tenants',
  AUDIT: '/api/audit',
  SEARCH: '/api/search',
} as const;

export const FILE_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  SPREADSHEET: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  PRESENTATION: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  VIDEO: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'],
  AUDIO: ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'],
  ARCHIVE: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
  TEXT: ['text/plain', 'text/csv', 'application/json', 'application/xml'],
} as const;

export const MAX_FILE_SIZE = {
  FREE_TIER: 100 * 1024 * 1024, // 100MB
  PREMIUM_TIER: 1024 * 1024 * 1024, // 1GB
  ENTERPRISE_TIER: 5 * 1024 * 1024 * 1024, // 5GB
} as const;

export const PROCESSING_TYPES = {
  IMAGE_RESIZE: 'image_resize',
  IMAGE_CONVERT: 'image_convert',
  DOCUMENT_OCR: 'document_ocr',
  VIDEO_THUMBNAIL: 'video_thumbnail',
  AUDIO_TRANSCODE: 'audio_transcode',
  VIRUS_SCAN: 'virus_scan',
  CONTENT_ANALYSIS: 'content_analysis',
} as const;

export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer',
  PROCESSOR: 'processor',
} as const;

export const PERMISSIONS = {
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',
  FILE_SHARE: 'file:share',
  PROCESSING_CREATE: 'processing:create',
  PROCESSING_READ: 'processing:read',
  USER_MANAGE: 'user:manage',
  TENANT_MANAGE: 'tenant:manage',
  AUDIT_READ: 'audit:read',
} as const;

export const NOTIFICATION_TYPES = {
  FILE_UPLOADED: 'file_uploaded',
  FILE_PROCESSED: 'file_processed',
  PROCESSING_FAILED: 'processing_failed',
  QUOTA_WARNING: 'quota_warning',
  SECURITY_ALERT: 'security_alert',
  SYSTEM_MAINTENANCE: 'system_maintenance',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const CACHE_KEYS = {
  USER_SESSION: 'user:session:',
  FILE_METADATA: 'file:metadata:',
  PROCESSING_JOB: 'processing:job:',
  TENANT_CONFIG: 'tenant:config:',
  API_RATE_LIMIT: 'api:rate_limit:',
} as const;

export const CACHE_TTL = {
  SHORT: 300, // 5 minutes
  MEDIUM: 1800, // 30 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
} as const;

export const PUBSUB_TOPICS = {
  FILE_EVENTS: 'file-events',
  PROCESSING_EVENTS: 'processing-events',
  AUDIT_EVENTS: 'audit-events',
  NOTIFICATION_EVENTS: 'notification-events',
} as const;

export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;