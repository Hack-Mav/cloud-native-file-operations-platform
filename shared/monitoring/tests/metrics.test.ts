import { MetricsService, metricsService } from '../src/metrics';

describe('MetricsService', () => {
  beforeAll(() => {
    metricsService.initialize('test-service', {
      enabled: true,
      prefix: 'test_',
      collectDefaultMetrics: false
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = MetricsService.getInstance();
      const instance2 = MetricsService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('HTTP Metrics', () => {
    it('should record HTTP request', () => {
      expect(() => {
        metricsService.recordHttpRequest('GET', '/api/test', 200, 50);
      }).not.toThrow();
    });

    it('should increment and decrement in-flight requests', () => {
      expect(() => {
        metricsService.incrementInFlightRequests('GET');
        metricsService.decrementInFlightRequests('GET');
      }).not.toThrow();
    });

    it('should record response size', () => {
      expect(() => {
        metricsService.recordResponseSize('GET', '/api/test', 1024);
      }).not.toThrow();
    });
  });

  describe('Business Metrics', () => {
    it('should record operation', () => {
      expect(() => {
        metricsService.recordOperation('file_upload', 'success', 100);
      }).not.toThrow();
    });

    it('should record error', () => {
      expect(() => {
        metricsService.recordError('ValidationError', 'INVALID_INPUT');
      }).not.toThrow();
    });

    it('should manage active connections', () => {
      expect(() => {
        metricsService.setActiveConnections('websocket', 10);
        metricsService.incrementActiveConnections('websocket');
        metricsService.decrementActiveConnections('websocket');
      }).not.toThrow();
    });
  });

  describe('Custom Metrics', () => {
    it('should create counter', () => {
      const counter = metricsService.createCounter('custom_counter', 'Test counter', ['label1']);
      expect(counter).toBeDefined();
      counter.inc({ label1: 'value1' });
    });

    it('should create histogram', () => {
      const histogram = metricsService.createHistogram('custom_histogram', 'Test histogram', ['label1']);
      expect(histogram).toBeDefined();
      histogram.observe({ label1: 'value1' }, 0.5);
    });

    it('should create gauge', () => {
      const gauge = metricsService.createGauge('custom_gauge', 'Test gauge', ['label1']);
      expect(gauge).toBeDefined();
      gauge.set({ label1: 'value1' }, 42);
    });
  });

  describe('Timer', () => {
    it('should start timer and return duration', async () => {
      const end = metricsService.startTimer();
      await new Promise(resolve => setTimeout(resolve, 10));
      const duration = end();
      expect(duration).toBeGreaterThan(0);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics output', async () => {
      const metrics = await metricsService.getMetrics();
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('getContentType', () => {
    it('should return prometheus content type', () => {
      const contentType = metricsService.getContentType();
      expect(contentType).toContain('text/plain');
    });
  });
});
