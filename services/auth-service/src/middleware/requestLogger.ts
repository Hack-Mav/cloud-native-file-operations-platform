import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Generate request ID if not present
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = uuidv4();
  }

  const startTime = Date.now();
  const requestId = req.headers['x-request-id'];

  // Log incoming request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    requestId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    body: req.method !== 'GET' ? req.body : undefined
  });

  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const duration = Date.now() - startTime;
    
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode}`, {
      requestId,
      duration: `${duration}ms`,
      statusCode: res.statusCode
    });

    return originalEnd(chunk, encoding, cb);
  } as any;

  next();
};