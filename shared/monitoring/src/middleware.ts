import { Request, Response, NextFunction, RequestHandler } from 'express';
import { metricsService } from './metrics';
import { loggingService } from './logging';
import { tracingService, SpanKind } from './tracing';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

/**
 * Middleware to add correlation ID to requests
 */
export function correlationIdMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  };
}

/**
 * Middleware to collect HTTP metrics
 */
export function metricsMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    req.startTime = Date.now();
    metricsService.incrementInFlightRequests(req.method);

    // Track response
    const originalSend = res.send.bind(res);
    res.send = function(body: any): Response {
      const duration = Date.now() - (req.startTime || Date.now());
      const contentLength = Buffer.isBuffer(body)
        ? body.length
        : typeof body === 'string'
        ? Buffer.byteLength(body)
        : 0;

      metricsService.decrementInFlightRequests(req.method);
      metricsService.recordHttpRequest(req.method, req.path, res.statusCode, duration);

      if (contentLength > 0) {
        metricsService.recordResponseSize(req.method, req.path, contentLength);
      }

      return originalSend(body);
    };

    next();
  };
}

/**
 * Middleware to add request logging
 */
export function loggingMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Log on response finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      loggingService.logRequest(
        req.method,
        req.path,
        res.statusCode,
        duration,
        {
          correlationId: req.correlationId,
          userAgent: req.headers['user-agent'],
          ip: req.ip || req.socket.remoteAddress
        }
      );
    });

    next();
  };
}

/**
 * Middleware to add distributed tracing
 */
export function tracingMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const span = tracingService.startSpan(`HTTP ${req.method} ${req.path}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'http.user_agent': req.headers['user-agent'] || '',
        'http.request_content_length': parseInt(req.headers['content-length'] || '0'),
        'correlation_id': req.correlationId || ''
      }
    });

    if (span) {
      // Set trace context in response headers
      const traceContext = tracingService.getTraceContext();
      if (traceContext) {
        res.setHeader('x-trace-id', traceContext.traceId);
      }

      res.on('finish', () => {
        span.setAttribute('http.status_code', res.statusCode);
        span.end();
      });
    }

    next();
  };
}

/**
 * Combined observability middleware
 */
export function observabilityMiddleware(): RequestHandler[] {
  return [
    correlationIdMiddleware(),
    metricsMiddleware(),
    loggingMiddleware(),
    tracingMiddleware()
  ];
}

/**
 * Metrics endpoint handler
 */
export function metricsEndpoint(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await metricsService.getMetrics();
      res.set('Content-Type', metricsService.getContentType());
      res.send(metrics);
    } catch (error) {
      res.status(500).send('Error collecting metrics');
    }
  };
}

/**
 * Error tracking middleware
 */
export function errorTrackingMiddleware(): (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return (err: Error, req: Request, res: Response, next: NextFunction): void => {
    // Record error metrics
    metricsService.recordError(err.name, (err as any).code || 'UNKNOWN');

    // Record error in tracing
    tracingService.recordError(err);

    // Log error
    loggingService.error(`Request error: ${err.message}`, {
      correlationId: req.correlationId,
      path: req.path,
      method: req.method
    }, err);

    next(err);
  };
}
