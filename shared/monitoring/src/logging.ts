import winston, { Logger, format, transports } from 'winston';
import { LoggingConfig, DEFAULT_CONFIG } from './types';
import { tracingService } from './tracing';

const { combine, timestamp, json, printf, colorize, errors } = format;

export interface LogContext {
  correlationId?: string;
  userId?: string;
  tenantId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

export class LoggingService {
  private static instance: LoggingService;
  private logger: Logger | null = null;
  private config: LoggingConfig;
  private serviceName: string;
  private initialized = false;

  private constructor() {
    this.config = DEFAULT_CONFIG.logging;
    this.serviceName = DEFAULT_CONFIG.serviceName;
  }

  static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  initialize(serviceName: string, config: Partial<LoggingConfig> = {}): void {
    if (this.initialized) {
      return;
    }

    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CONFIG.logging, ...config };

    if (!this.config.enabled) {
      console.log('Logging service is disabled');
      return;
    }

    const logTransports: winston.transport[] = [];

    // Console transport
    if (this.config.format === 'json') {
      logTransports.push(
        new transports.Console({
          format: combine(
            timestamp(),
            errors({ stack: true }),
            this.addServiceInfo(),
            this.addTraceContext(),
            json()
          )
        })
      );
    } else {
      logTransports.push(
        new transports.Console({
          format: combine(
            colorize(),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            errors({ stack: true }),
            this.simpleFormat()
          )
        })
      );
    }

    // Elasticsearch transport (optional)
    if (this.config.elasticsearch?.enabled) {
      try {
        // Dynamic import to avoid requiring elasticsearch if not used
        const ElasticsearchTransport = require('winston-elasticsearch').ElasticsearchTransport;
        logTransports.push(
          new ElasticsearchTransport({
            level: this.config.level,
            clientOpts: {
              node: this.config.elasticsearch.node
            },
            indexPrefix: this.config.elasticsearch.index,
            messageType: 'log'
          })
        );
      } catch (error) {
        console.warn('Failed to initialize Elasticsearch transport:', error);
      }
    }

    this.logger = winston.createLogger({
      level: this.config.level,
      defaultMeta: { service: serviceName },
      transports: logTransports
    });

    this.initialized = true;
    console.log(`Logging service initialized for ${serviceName}`);
  }

  private addServiceInfo() {
    return format((info) => {
      info.service = this.serviceName;
      info.environment = process.env.NODE_ENV || 'development';
      return info;
    })();
  }

  private addTraceContext() {
    return format((info) => {
      const traceContext = tracingService.getTraceContext();
      if (traceContext) {
        info.traceId = traceContext.traceId;
        info.spanId = traceContext.spanId;
      }
      return info;
    })();
  }

  private simpleFormat() {
    return printf(({ level, message, timestamp, service, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
    });
  }

  private getLogger(): Logger {
    if (!this.logger) {
      // Return a no-op logger if not initialized
      return winston.createLogger({
        silent: true
      });
    }
    return this.logger;
  }

  // Logging methods
  error(message: string, context?: LogContext, error?: Error): void {
    this.getLogger().error(message, {
      ...context,
      ...(error && { error: { message: error.message, stack: error.stack, name: error.name } })
    });
  }

  warn(message: string, context?: LogContext): void {
    this.getLogger().warn(message, context);
  }

  info(message: string, context?: LogContext): void {
    this.getLogger().info(message, context);
  }

  http(message: string, context?: LogContext): void {
    this.getLogger().http(message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.getLogger().debug(message, context);
  }

  // Structured logging helpers
  logRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    context?: LogContext
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http';
    this.getLogger().log(level, `${method} ${path} ${statusCode} ${durationMs}ms`, {
      type: 'http_request',
      method,
      path,
      statusCode,
      durationMs,
      ...context
    });
  }

  logOperation(
    operation: string,
    status: 'started' | 'completed' | 'failed',
    durationMs?: number,
    context?: LogContext,
    error?: Error
  ): void {
    const level = status === 'failed' ? 'error' : 'info';
    this.getLogger().log(level, `Operation ${operation} ${status}`, {
      type: 'operation',
      operation,
      status,
      durationMs,
      ...context,
      ...(error && { error: { message: error.message, stack: error.stack } })
    });
  }

  logSecurity(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context?: LogContext
  ): void {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    this.getLogger().log(level, `Security event: ${event}`, {
      type: 'security',
      event,
      severity,
      ...context
    });
  }

  logAudit(
    action: string,
    resource: string,
    outcome: 'success' | 'failure',
    context?: LogContext
  ): void {
    this.getLogger().info(`Audit: ${action} on ${resource} - ${outcome}`, {
      type: 'audit',
      action,
      resource,
      outcome,
      ...context
    });
  }

  // Create child logger with default context
  child(defaultContext: LogContext): ChildLogger {
    return new ChildLogger(this, defaultContext);
  }
}

export class ChildLogger {
  constructor(
    private parent: LoggingService,
    private defaultContext: LogContext
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.defaultContext, ...context };
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.parent.error(message, this.mergeContext(context), error);
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  http(message: string, context?: LogContext): void {
    this.parent.http(message, this.mergeContext(context));
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }
}

export const loggingService = LoggingService.getInstance();
