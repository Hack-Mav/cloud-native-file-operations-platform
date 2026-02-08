import { Response } from 'express';

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    timestamp: string;
    requestId: string;
    version: string;
    service?: string;
    processingTime?: number;
  };
  pagination?: PaginationInfo;
}

export class ResponseFormatter {
  static success<T>(
    res: Response,
    data: T,
    statusCode: number = 200,
    metadata?: Partial<ApiResponse['metadata']>
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: res.req?.correlationId || 'unknown',
        version: res.req?.apiVersion || 'v1',
        ...metadata
      }
    };

    return res.status(statusCode).json(response);
  }

  static error(
    res: Response,
    code: string,
    message: string,
    statusCode: number = 500,
    details?: any,
    metadata?: Partial<ApiResponse['metadata']>
  ): Response {
    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        details
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: res.req?.correlationId || 'unknown',
        version: res.req?.apiVersion || 'v1',
        ...metadata
      }
    };

    return res.status(statusCode).json(response);
  }

  static paginated<T>(
    res: Response,
    data: T[],
    pagination: PaginationInfo,
    statusCode: number = 200,
    metadata?: Partial<ApiResponse['metadata']>
  ): Response {
    const response: ApiResponse<T[]> = {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: res.req?.correlationId || 'unknown',
        version: res.req?.apiVersion || 'v1',
        ...metadata
      },
      pagination
    };

    return res.status(statusCode).json(response);
  }

  static created<T>(
    res: Response,
    data: T,
    location?: string,
    metadata?: Partial<ApiResponse['metadata']>
  ): Response {
    if (location) {
      res.setHeader('Location', location);
    }

    return this.success(res, data, 201, metadata);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  static accepted<T>(
    res: Response,
    data?: T,
    metadata?: Partial<ApiResponse['metadata']>
  ): Response {
    return this.success(res, data, 202, metadata);
  }

  // Common error responses
  static badRequest(
    res: Response,
    message: string = 'Bad Request',
    details?: any
  ): Response {
    return this.error(res, 'BAD_REQUEST', message, 400, details);
  }

  static unauthorized(
    res: Response,
    message: string = 'Unauthorized',
    details?: any
  ): Response {
    return this.error(res, 'UNAUTHORIZED', message, 401, details);
  }

  static forbidden(
    res: Response,
    message: string = 'Forbidden',
    details?: any
  ): Response {
    return this.error(res, 'FORBIDDEN', message, 403, details);
  }

  static notFound(
    res: Response,
    message: string = 'Not Found',
    details?: any
  ): Response {
    return this.error(res, 'NOT_FOUND', message, 404, details);
  }

  static conflict(
    res: Response,
    message: string = 'Conflict',
    details?: any
  ): Response {
    return this.error(res, 'CONFLICT', message, 409, details);
  }

  static unprocessableEntity(
    res: Response,
    message: string = 'Unprocessable Entity',
    details?: any
  ): Response {
    return this.error(res, 'UNPROCESSABLE_ENTITY', message, 422, details);
  }

  static tooManyRequests(
    res: Response,
    message: string = 'Too Many Requests',
    retryAfter?: number
  ): Response {
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
    }

    return this.error(res, 'TOO_MANY_REQUESTS', message, 429);
  }

  static internalServerError(
    res: Response,
    message: string = 'Internal Server Error',
    details?: any
  ): Response {
    return this.error(res, 'INTERNAL_SERVER_ERROR', message, 500, details);
  }

  static serviceUnavailable(
    res: Response,
    message: string = 'Service Unavailable',
    retryAfter?: number
  ): Response {
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
    }

    return this.error(res, 'SERVICE_UNAVAILABLE', message, 503);
  }

  static gatewayTimeout(
    res: Response,
    message: string = 'Gateway Timeout'
  ): Response {
    return this.error(res, 'GATEWAY_TIMEOUT', message, 504);
  }
}

// Utility function to calculate pagination info
export function calculatePagination(
  page: number,
  limit: number,
  total: number
): PaginationInfo {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

// Utility function to extract pagination from query
export function extractPagination(query: any): { page: number; limit: number } {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  
  return { page, limit };
}

// Utility function to extract sorting from query
export function extractSorting(query: any): { sort?: string; order?: 'asc' | 'desc' } {
  const sort = query.sort;
  const order = query.order === 'desc' ? 'desc' : 'asc';
  
  return { sort, order };
}

// Content negotiation helper
export function negotiateContent(acceptHeader: string): 'json' | 'xml' | 'csv' | 'unknown' {
  if (!acceptHeader) return 'json';
  
  const accept = acceptHeader.toLowerCase();
  
  if (accept.includes('application/json')) return 'json';
  if (accept.includes('application/xml') || accept.includes('text/xml')) return 'xml';
  if (accept.includes('text/csv')) return 'csv';
  
  return 'unknown';
}

// Response compression helper
export function shouldCompress(contentType: string, size: number): boolean {
  const compressibleTypes = [
    'application/json',
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript'
  ];
  
  return compressibleTypes.some(type => contentType.includes(type)) && size > 1024;
}