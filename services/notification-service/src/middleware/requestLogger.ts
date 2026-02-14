import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Generate or use existing correlation ID
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.correlationId = correlationId;
  req.startTime = Date.now();

  // Set correlation ID in response headers
  res.setHeader('x-correlation-id', correlationId);

  // Log request
  console.log(`[${correlationId}] --> ${req.method} ${req.path}`, {
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.socket.remoteAddress
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());
    const logLevel = res.statusCode >= 400 ? 'warn' : 'log';

    console[logLevel](`[${correlationId}] <-- ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
  });

  next();
};

export default requestLogger;
