export const config = {
  apiUrl: import.meta.env.VITE_API_URL || '/api',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:3002',

  demo: {
    enabled: import.meta.env.VITE_ENABLE_DEMO_MODE === 'true',
  },

  auth: {
    tokenKey: 'auth_token',
    refreshTokenKey: 'refresh_token',
    userKey: 'user_data',
  },

  upload: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    chunkSize: 5 * 1024 * 1024, // 5MB chunks
    allowedTypes: [
      'image/*',
      'video/*',
      'audio/*',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.*',
      'text/*',
      'application/zip',
      'application/x-rar-compressed',
    ],
  },

  pagination: {
    defaultPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100],
  },
};
