import { Request, Response, NextFunction } from 'express';

interface ResponseMetadata {
  timestamp: string;
  requestId: string;
  version: string;
  service?: string;
  processingTime?: number;
}

interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: ResponseMetadata;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function responseTransformer(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Store original json method
  const originalJson = res.json;
  const originalSend = res.send;
  
  // Override res.json to apply transformations
  res.json = function(data: any): Response {
    const transformedData = transformResponse(data, req, startTime);
    return originalJson.call(this, transformedData);
  };
  
  // Override res.send for non-JSON responses
  res.send = function(data: any): Response {
    // Only transform if content-type is JSON
    const contentType = res.getHeader('content-type') as string;
    if (contentType && contentType.includes('application/json')) {
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        const transformedData = transformResponse(parsedData, req, startTime);
        return originalSend.call(this, JSON.stringify(transformedData));
      } catch (error) {
        // If parsing fails, send as-is
        return originalSend.call(this, data);
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

function transformResponse(data: any, req: Request, startTime: number): StandardResponse {
  const processingTime = Date.now() - startTime;
  
  // Create metadata
  const metadata: ResponseMetadata = {
    timestamp: new Date().toISOString(),
    requestId: req.correlationId,
    version: req.apiVersion || 'v1',
    service: req.headers['x-gateway-service'] as string,
    processingTime
  };
  
  // If data is already in standard format, just update metadata
  if (data && typeof data === 'object' && ('success' in data || 'error' in data)) {
    return {
      ...data,
      metadata: {
        ...data.metadata,
        ...metadata
      }
    };
  }
  
  // Handle error responses
  if (data && typeof data === 'object' && data.error) {
    return {
      success: false,
      error: data.error,
      metadata
    };
  }
  
  // Handle successful responses
  return {
    success: true,
    data,
    metadata
  };
}

// Middleware for paginated responses
export function paginationTransformer(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json;
  
  res.json = function(data: any): Response {
    if (data && typeof data === 'object' && data.items && data.pagination) {
      const transformedData = {
        success: true,
        data: data.items,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: req.correlationId,
          version: req.apiVersion || 'v1'
        },
        pagination: data.pagination
      };
      
      return originalJson.call(this, transformedData);
    }
    
    return originalJson.call(this, data);
  };
  
  next();
}

// Middleware for error response transformation
export function errorTransformer(req: Request, res: Response, next: NextFunction): void {
  const originalStatus = res.status;
  
  res.status = function(code: number): Response {
    // Call original status method
    originalStatus.call(this, code);
    
    // If it's an error status, ensure error response format
    if (code >= 400) {
      const originalJson = res.json;
      
      res.json = function(data: any): Response {
        const errorResponse = {
          success: false,
          error: {
            code: data?.error?.code || getDefaultErrorCode(code),
            message: data?.error?.message || getDefaultErrorMessage(code),
            details: data?.error?.details
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId,
            version: req.apiVersion || 'v1'
          }
        };
        
        return originalJson.call(this, errorResponse);
      };
    }
    
    return this;
  };
  
  next();
}

// Middleware for response compression and optimization
export function responseOptimizer(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json;
  
  res.json = function(data: any): Response {
    // Remove null/undefined values to reduce payload size
    const optimizedData = removeNullValues(data);
    
    // Add cache headers for cacheable responses
    if (req.method === 'GET' && res.statusCode === 200) {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
      res.setHeader('ETag', generateETag(optimizedData));
    }
    
    return originalJson.call(this, optimizedData);
  };
  
  next();
}

function removeNullValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(removeNullValues).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = removeNullValues(value);
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned;
  }
  
  return obj;
}

function generateETag(data: any): string {
  // Simple ETag generation based on JSON string hash
  const jsonString = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

function getDefaultErrorCode(statusCode: number): string {
  const errorCodes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT'
  };
  
  return errorCodes[statusCode] || 'UNKNOWN_ERROR';
}

function getDefaultErrorMessage(statusCode: number): string {
  const errorMessages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  return errorMessages[statusCode] || 'Unknown Error';
}