import { Request, Response, NextFunction } from 'express';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string;
  };
  metadata: {
    timestamp: string;
    requestId: string;
    version: string;
    service: string;
  };
}

export class APIError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code?: string, details?: any) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code || this.getDefaultCode(statusCode);
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, APIError);
  }

  private getDefaultCode(statusCode: number): string {
    const codes: Record<number, string> = {
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
    
    return codes[statusCode] || 'UNKNOWN_ERROR';
  }
}

export function errorHandler(
  error: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  console.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    correlationId: req.correlationId,
    url: req.originalUrl,
    method: req.method,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';
  let details: any = undefined;

  // Handle different error types
  if (error instanceof APIError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;
    details = error.details;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = extractValidationDetails(error);
  } else if (error.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_FORMAT';
    message = 'Invalid data format';
  } else if (error.name === 'MongoError' || error.name === 'MongooseError') {
    statusCode = 500;
    errorCode = 'DATABASE_ERROR';
    message = 'Database operation failed';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  } else if (error.message.includes('ECONNREFUSED')) {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    message = 'Upstream service is unavailable';
  } else if (error.message.includes('timeout')) {
    statusCode = 504;
    errorCode = 'GATEWAY_TIMEOUT';
    message = 'Request timeout';
  }

  const errorResponse: ErrorResponse = {
    error: {
      code: errorCode,
      message,
      details,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: req.correlationId,
      version: req.apiVersion || 'v1',
      service: 'api-gateway'
    }
  };

  // Set appropriate headers
  res.setHeader('Content-Type', 'application/json');
  
  // Add retry headers for certain error types
  if (statusCode === 503 || statusCode === 504) {
    res.setHeader('Retry-After', '30'); // Retry after 30 seconds
  }

  res.status(statusCode).json(errorResponse);
}

// Handle unhandled promise rejections
export function handleUnhandledRejection(reason: any, promise: Promise<any>): void {
  console.error('Unhandled Promise Rejection:', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise
  });
  
  // In production, you might want to gracefully shutdown
  if (process.env.NODE_ENV === 'production') {
    console.error('Shutting down due to unhandled promise rejection');
    process.exit(1);
  }
}

// Handle uncaught exceptions
export function handleUncaughtException(error: Error): void {
  console.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  
  // Graceful shutdown
  console.error('Shutting down due to uncaught exception');
  process.exit(1);
}

// 404 handler for unmatched routes
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      details: {
        method: req.method,
        path: req.originalUrl,
        availableRoutes: getAvailableRoutes()
      }
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: req.correlationId,
      version: req.apiVersion || 'v1',
      service: 'api-gateway'
    }
  };

  res.status(404).json(errorResponse);
}

// Circuit breaker error handler
export function circuitBreakerHandler(serviceName: string) {
  return (req: Request, res: Response): void => {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'CIRCUIT_BREAKER_OPEN',
        message: `Service ${serviceName} is currently unavailable due to circuit breaker`,
        details: {
          service: serviceName,
          retryAfter: 60 // seconds
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId,
        version: req.apiVersion || 'v1',
        service: 'api-gateway'
      }
    };

    res.setHeader('Retry-After', '60');
    res.status(503).json(errorResponse);
  };
}

function extractValidationDetails(error: any): any {
  if (error.errors) {
    const details: any = {};
    for (const [field, fieldError] of Object.entries(error.errors)) {
      details[field] = (fieldError as any).message;
    }
    return details;
  }
  return undefined;
}

function getAvailableRoutes(): string[] {
  // In a real implementation, this would return actual available routes
  return [
    'GET /health',
    'GET /services/health',
    'POST /api/auth/login',
    'GET /api/files',
    'POST /api/files/upload',
    'GET /api/processing/jobs',
    'POST /api/processing/jobs'
  ];
}

// Setup global error handlers
export function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', handleUnhandledRejection);
  process.on('uncaughtException', handleUncaughtException);
}

// Graceful shutdown handler
export function setupGracefulShutdown(server: any, cleanup?: () => Promise<void>): void {
  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    
    server.close(async () => {
      console.log('HTTP server closed');
      
      if (cleanup) {
        try {
          await cleanup();
          console.log('Cleanup completed');
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      }
      
      process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}