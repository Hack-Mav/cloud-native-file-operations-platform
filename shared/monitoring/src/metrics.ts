import client, {
  Registry,
  Counter,
  Histogram,
  Gauge,
  Summary,
  collectDefaultMetrics
} from 'prom-client';
import { MetricsConfig, DEFAULT_CONFIG } from './types';

export class MetricsService {
  private static instance: MetricsService;
  private registry: Registry;
  private config: MetricsConfig;
  private serviceName: string;
  private initialized = false;

  // Standard metrics
  private httpRequestsTotal!: Counter;
  private httpRequestDuration!: Histogram;
  private httpRequestsInFlight!: Gauge;
  private httpResponseSize!: Summary;

  // Business metrics
  private operationsTotal!: Counter;
  private operationDuration!: Histogram;
  private errorTotal!: Counter;
  private activeConnections!: Gauge;

  private constructor() {
    this.registry = new Registry();
    this.config = DEFAULT_CONFIG.metrics;
    this.serviceName = DEFAULT_CONFIG.serviceName;
  }

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  initialize(serviceName: string, config: Partial<MetricsConfig> = {}): void {
    if (this.initialized) {
      return;
    }

    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CONFIG.metrics, ...config };

    if (!this.config.enabled) {
      console.log('Metrics collection is disabled');
      return;
    }

    // Set default labels
    this.registry.setDefaultLabels({
      service: serviceName,
      ...this.config.defaultLabels
    });

    // Collect default Node.js metrics
    if (this.config.collectDefaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: this.config.prefix
      });
    }

    // Initialize standard HTTP metrics
    this.httpRequestsTotal = new Counter({
      name: `${this.config.prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code'],
      registers: [this.registry]
    });

    this.httpRequestDuration = new Histogram({
      name: `${this.config.prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status_code'],
      buckets: this.config.buckets,
      registers: [this.registry]
    });

    this.httpRequestsInFlight = new Gauge({
      name: `${this.config.prefix}http_requests_in_flight`,
      help: 'Number of HTTP requests currently being processed',
      labelNames: ['method'],
      registers: [this.registry]
    });

    this.httpResponseSize = new Summary({
      name: `${this.config.prefix}http_response_size_bytes`,
      help: 'HTTP response size in bytes',
      labelNames: ['method', 'path'],
      registers: [this.registry]
    });

    // Initialize business metrics
    this.operationsTotal = new Counter({
      name: `${this.config.prefix}operations_total`,
      help: 'Total number of business operations',
      labelNames: ['operation', 'status'],
      registers: [this.registry]
    });

    this.operationDuration = new Histogram({
      name: `${this.config.prefix}operation_duration_seconds`,
      help: 'Business operation duration in seconds',
      labelNames: ['operation'],
      buckets: this.config.buckets,
      registers: [this.registry]
    });

    this.errorTotal = new Counter({
      name: `${this.config.prefix}errors_total`,
      help: 'Total number of errors',
      labelNames: ['type', 'code'],
      registers: [this.registry]
    });

    this.activeConnections = new Gauge({
      name: `${this.config.prefix}active_connections`,
      help: 'Number of active connections',
      labelNames: ['type'],
      registers: [this.registry]
    });

    this.initialized = true;
    console.log(`Metrics service initialized for ${serviceName}`);
  }

  // HTTP Metrics
  recordHttpRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    if (!this.config.enabled) return;

    const durationSeconds = durationMs / 1000;
    const normalizedPath = this.normalizePath(path);

    this.httpRequestsTotal.inc({ method, path: normalizedPath, status_code: statusCode });
    this.httpRequestDuration.observe({ method, path: normalizedPath, status_code: statusCode }, durationSeconds);
  }

  incrementInFlightRequests(method: string): void {
    if (!this.config.enabled) return;
    this.httpRequestsInFlight.inc({ method });
  }

  decrementInFlightRequests(method: string): void {
    if (!this.config.enabled) return;
    this.httpRequestsInFlight.dec({ method });
  }

  recordResponseSize(method: string, path: string, sizeBytes: number): void {
    if (!this.config.enabled) return;
    this.httpResponseSize.observe({ method, path: this.normalizePath(path) }, sizeBytes);
  }

  // Business Metrics
  recordOperation(operation: string, status: 'success' | 'failure', durationMs?: number): void {
    if (!this.config.enabled) return;

    this.operationsTotal.inc({ operation, status });
    if (durationMs !== undefined) {
      this.operationDuration.observe({ operation }, durationMs / 1000);
    }
  }

  recordError(type: string, code: string): void {
    if (!this.config.enabled) return;
    this.errorTotal.inc({ type, code });
  }

  setActiveConnections(type: string, count: number): void {
    if (!this.config.enabled) return;
    this.activeConnections.set({ type }, count);
  }

  incrementActiveConnections(type: string): void {
    if (!this.config.enabled) return;
    this.activeConnections.inc({ type });
  }

  decrementActiveConnections(type: string): void {
    if (!this.config.enabled) return;
    this.activeConnections.dec({ type });
  }

  // Custom metrics
  createCounter(name: string, help: string, labelNames: string[] = []): Counter {
    return new Counter({
      name: `${this.config.prefix}${name}`,
      help,
      labelNames,
      registers: [this.registry]
    });
  }

  createHistogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): Histogram {
    return new Histogram({
      name: `${this.config.prefix}${name}`,
      help,
      labelNames,
      buckets: buckets || this.config.buckets,
      registers: [this.registry]
    });
  }

  createGauge(name: string, help: string, labelNames: string[] = []): Gauge {
    return new Gauge({
      name: `${this.config.prefix}${name}`,
      help,
      labelNames,
      registers: [this.registry]
    });
  }

  createSummary(name: string, help: string, labelNames: string[] = []): Summary {
    return new Summary({
      name: `${this.config.prefix}${name}`,
      help,
      labelNames,
      registers: [this.registry]
    });
  }

  // Timer utility
  startTimer(): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1e6; // Convert to milliseconds
    };
  }

  // Get metrics output
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  getRegistry(): Registry {
    return this.registry;
  }

  private normalizePath(path: string): string {
    // Replace IDs with placeholders
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:id');
  }
}

export const metricsService = MetricsService.getInstance();

// Re-export prom-client types for custom metrics
export { Counter, Histogram, Gauge, Summary, Registry } from 'prom-client';
