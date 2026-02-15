/**
 * SDK Error Classes
 */

export class FileOpsError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: Record<string, unknown>,
    requestId?: string
  ) {
    super(message);
    this.name = 'FileOpsError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FileOpsError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      requestId: this.requestId,
    };
  }
}

export class AuthenticationError extends FileOpsError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends FileOpsError {
  constructor(message: string = 'Permission denied', details?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends FileOpsError {
  public readonly field?: string;

  constructor(message: string, field?: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class NotFoundError extends FileOpsError {
  public readonly resourceType?: string;
  public readonly resourceId?: string;

  constructor(
    resourceType?: string,
    resourceId?: string,
    message?: string
  ) {
    const msg = message || `${resourceType || 'Resource'} not found${resourceId ? `: ${resourceId}` : ''}`;
    super(msg, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

export class RateLimitError extends FileOpsError {
  public readonly retryAfter?: number;
  public readonly limit?: number;
  public readonly remaining?: number;
  public readonly reset?: Date;

  constructor(
    retryAfter?: number,
    limit?: number,
    remaining?: number,
    reset?: Date
  ) {
    super('Rate limit exceeded', 'RATE_LIMITED', 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.reset = reset;
  }
}

export class ConflictError extends FileOpsError {
  constructor(message: string = 'Resource conflict', details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

export class NetworkError extends FileOpsError {
  public readonly originalError?: Error;

  constructor(message: string = 'Network error', originalError?: Error) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

export class TimeoutError extends FileOpsError {
  constructor(message: string = 'Request timed out') {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class ServerError extends FileOpsError {
  constructor(message: string = 'Internal server error', details?: Record<string, unknown>) {
    super(message, 'SERVER_ERROR', 500, details);
    this.name = 'ServerError';
  }
}
