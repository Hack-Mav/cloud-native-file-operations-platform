export interface RouteConfig {
  path: string;
  service: string;
  requireAuth: boolean;
  customRateLimit?: {
    windowMs: number;
    max: number;
    message?: string;
  };
  methods?: string[];
  stripPath?: boolean;
  preserveHost?: boolean;
}

export const routingConfig: RouteConfig[] = [
  // Authentication Service Routes
  {
    path: '/api/auth',
    service: 'auth-service',
    requireAuth: false, // Auth endpoints don't require pre-authentication
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    customRateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // More restrictive for auth endpoints
      message: 'Too many authentication attempts, please try again later.'
    }
  },
  
  // File Management Service Routes
  {
    path: '/api/files',
    service: 'file-service',
    requireAuth: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    customRateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // Higher limit for file operations
      message: 'Too many file operations, please try again later.'
    }
  },
  
  // Processing Service Routes
  {
    path: '/api/processing',
    service: 'processing-service',
    requireAuth: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    customRateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      message: 'Too many processing requests, please try again later.'
    }
  },
  
  // Notification Service Routes
  {
    path: '/api/notifications',
    service: 'notification-service',
    requireAuth: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  
  // WebSocket connections for notifications
  {
    path: '/ws',
    service: 'notification-service',
    requireAuth: true,
    methods: ['GET'] // WebSocket upgrade
  },
  
  // Tenant Management Service Routes (when implemented)
  {
    path: '/api/tenants',
    service: 'tenant-service',
    requireAuth: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    customRateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 50, // More restrictive for tenant management
      message: 'Too many tenant management requests, please try again later.'
    }
  },
  
  // Audit Service Routes (when implemented)
  {
    path: '/api/audit',
    service: 'audit-service',
    requireAuth: true,
    methods: ['GET', 'POST'],
    customRateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many audit requests, please try again later.'
    }
  },
  
  // Search Service Routes (when implemented)
  {
    path: '/api/search',
    service: 'search-service',
    requireAuth: true,
    methods: ['GET', 'POST']
  },
  
  // Monitoring and Metrics (internal endpoints)
  {
    path: '/api/metrics',
    service: 'monitoring-service',
    requireAuth: true,
    methods: ['GET'],
    customRateLimit: {
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 20, // Very restrictive for metrics
      message: 'Too many metrics requests, please try again later.'
    }
  }
];

// Service-specific configurations
export const serviceConfigs = {
  'auth-service': {
    timeout: 10000, // 10 seconds for auth operations
    retries: 2,
    circuitBreaker: {
      threshold: 5,
      timeout: 30000,
      resetTimeout: 60000
    }
  },
  'file-service': {
    timeout: 300000, // 5 minutes for large file operations
    retries: 1,
    circuitBreaker: {
      threshold: 10,
      timeout: 60000,
      resetTimeout: 120000
    }
  },
  'processing-service': {
    timeout: 600000, // 10 minutes for processing operations
    retries: 1,
    circuitBreaker: {
      threshold: 8,
      timeout: 120000,
      resetTimeout: 300000
    }
  },
  'notification-service': {
    timeout: 15000, // 15 seconds for notifications
    retries: 3,
    circuitBreaker: {
      threshold: 5,
      timeout: 30000,
      resetTimeout: 60000
    }
  }
};

export function getRouteConfig(path: string): RouteConfig | undefined {
  return routingConfig.find(route => path.startsWith(route.path));
}

export function getServiceConfig(serviceName: string) {
  return serviceConfigs[serviceName as keyof typeof serviceConfigs] || {
    timeout: 30000,
    retries: 2,
    circuitBreaker: {
      threshold: 5,
      timeout: 30000,
      resetTimeout: 60000
    }
  };
}