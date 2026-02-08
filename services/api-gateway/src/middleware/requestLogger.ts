import { Request, Response, NextFunction } from 'express';

interface LogEntry {
  timestamp: string;
  correlationId: string;
  method: string;
  url: string;
  userAgent?: string;
  ip: string;
  userId?: string;
  responseTime?: number;
  statusCode?: number;
  contentLength?: number;
  error?: string;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Create base log entry
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userId: req.user?.id
  };
  
  // Log incoming request
  console.log('Incoming request:', JSON.stringify({
    ...logEntry,
    headers: filterSensitiveHeaders(req.headers),
    query: req.query,
    body: filterSensitiveBody(req.body)
  }));
  
  // Override res.end to capture response details
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const responseTime = Date.now() - startTime;
    
    // Update log entry with response details
    logEntry.responseTime = responseTime;
    logEntry.statusCode = res.statusCode;
    logEntry.contentLength = res.get('content-length') ? parseInt(res.get('content-length')!) : undefined;
    
    // Log response
    console.log('Response:', JSON.stringify({
      ...logEntry,
      responseHeaders: filterSensitiveHeaders(res.getHeaders())
    }));
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  // Handle errors
  res.on('error', (error) => {
    logEntry.error = error.message;
    console.error('Response error:', JSON.stringify(logEntry));
  });
  
  next();
}

function filterSensitiveHeaders(headers: any): any {
  const filtered = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  
  sensitiveHeaders.forEach(header => {
    if (filtered[header]) {
      filtered[header] = '[REDACTED]';
    }
  });
  
  return filtered;
}

function filterSensitiveBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const filtered = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];
  
  sensitiveFields.forEach(field => {
    if (filtered[field]) {
      filtered[field] = '[REDACTED]';
    }
  });
  
  return filtered;
}