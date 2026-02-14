export interface MonitoringConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  metrics: MetricsConfig;
  tracing: TracingConfig;
  logging: LoggingConfig;
}

export interface MetricsConfig {
  enabled: boolean;
  port?: number;
  path?: string;
  prefix?: string;
  defaultLabels?: Record<string, string>;
  collectDefaultMetrics?: boolean;
  buckets?: number[];
}

export interface TracingConfig {
  enabled: boolean;
  endpoint?: string;
  samplingRatio?: number;
  propagators?: string[];
}

export interface LoggingConfig {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'http' | 'debug';
  format: 'json' | 'simple';
  elasticsearch?: {
    enabled: boolean;
    node: string;
    index: string;
  };
}

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: Record<string, HealthCheckResult>;
}

export const DEFAULT_CONFIG: MonitoringConfig = {
  serviceName: 'unknown-service',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  metrics: {
    enabled: true,
    port: 9090,
    path: '/metrics',
    prefix: 'fileops_',
    collectDefaultMetrics: true,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  },
  tracing: {
    enabled: true,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    samplingRatio: 1.0,
    propagators: ['tracecontext', 'baggage']
  },
  logging: {
    enabled: true,
    level: 'info',
    format: 'json',
    elasticsearch: {
      enabled: false,
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
      index: 'fileops-logs'
    }
  }
};
