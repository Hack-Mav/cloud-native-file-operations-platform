import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  Span,
  Tracer,
  Context
} from '@opentelemetry/api';
import { TracingConfig, DEFAULT_CONFIG } from './types';

export class TracingService {
  private static instance: TracingService;
  private sdk: NodeSDK | null = null;
  private tracer: Tracer | null = null;
  private config: TracingConfig;
  private serviceName: string;
  private initialized = false;

  private constructor() {
    this.config = DEFAULT_CONFIG.tracing;
    this.serviceName = DEFAULT_CONFIG.serviceName;
  }

  static getInstance(): TracingService {
    if (!TracingService.instance) {
      TracingService.instance = new TracingService();
    }
    return TracingService.instance;
  }

  async initialize(serviceName: string, version: string, config: Partial<TracingConfig> = {}): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CONFIG.tracing, ...config };

    if (!this.config.enabled) {
      console.log('Tracing is disabled');
      return;
    }

    try {
      const exporter = new OTLPTraceExporter({
        url: this.config.endpoint
      });

      this.sdk = new NodeSDK({
        resource: new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
          [SemanticResourceAttributes.SERVICE_VERSION]: version,
          [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development'
        }),
        traceExporter: exporter,
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-dns': { enabled: false }
          })
        ]
      });

      await this.sdk.start();
      this.tracer = trace.getTracer(serviceName, version);
      this.initialized = true;

      console.log(`Tracing service initialized for ${serviceName}`);
    } catch (error) {
      console.error('Failed to initialize tracing:', error);
    }
  }

  getTracer(): Tracer | null {
    return this.tracer;
  }

  // Create a new span
  startSpan(
    name: string,
    options: {
      kind?: SpanKind;
      attributes?: Record<string, string | number | boolean>;
      parentContext?: Context;
    } = {}
  ): Span | null {
    if (!this.tracer || !this.config.enabled) {
      return null;
    }

    const ctx = options.parentContext || context.active();
    return this.tracer.startSpan(name, {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: options.attributes
    }, ctx);
  }

  // Wrap a function with a span
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options: {
      kind?: SpanKind;
      attributes?: Record<string, string | number | boolean>;
    } = {}
  ): Promise<T> {
    if (!this.tracer || !this.config.enabled) {
      // Create a no-op span
      const noopSpan = {
        end: () => {},
        setAttribute: () => noopSpan,
        setStatus: () => noopSpan,
        recordException: () => {},
        addEvent: () => noopSpan
      } as unknown as Span;
      return fn(noopSpan);
    }

    const span = this.tracer.startSpan(name, {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: options.attributes
    });

    try {
      const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  // Get current span
  getCurrentSpan(): Span | undefined {
    return trace.getSpan(context.active());
  }

  // Add attributes to current span
  addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
    const span = this.getCurrentSpan();
    if (span) {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }
  }

  // Add event to current span
  addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    const span = this.getCurrentSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  // Record error on current span
  recordError(error: Error): void {
    const span = this.getCurrentSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
    }
  }

  // Extract trace context for propagation
  getTraceContext(): { traceId: string; spanId: string } | null {
    const span = this.getCurrentSpan();
    if (!span) {
      return null;
    }

    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId
    };
  }

  // Inject trace context into headers
  injectTraceContext(headers: Record<string, string>): Record<string, string> {
    const traceContext = this.getTraceContext();
    if (traceContext) {
      headers['x-trace-id'] = traceContext.traceId;
      headers['x-span-id'] = traceContext.spanId;
    }
    return headers;
  }

  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.sdk = null;
      this.tracer = null;
      this.initialized = false;
    }
  }
}

export const tracingService = TracingService.getInstance();

// Re-export OpenTelemetry types
export { SpanKind, SpanStatusCode, Span, Tracer, Context } from '@opentelemetry/api';
