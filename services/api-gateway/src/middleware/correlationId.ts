import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if correlation ID already exists in headers
  let correlationId = req.headers['x-correlation-id'] as string;
  
  // Generate new correlation ID if not provided
  if (!correlationId) {
    correlationId = uuidv4();
  }
  
  // Add to request object
  req.correlationId = correlationId;
  
  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Add to request headers for downstream services
  req.headers['x-correlation-id'] = correlationId;
  
  next();
}