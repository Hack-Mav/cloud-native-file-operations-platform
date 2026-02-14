import { HealthService, healthService, healthChecks } from '../src/health';

// Mock metricsService
jest.mock('../src/metrics', () => ({
  metricsService: {
    createGauge: jest.fn(() => ({
      set: jest.fn()
    }))
  }
}));

describe('HealthService', () => {
  beforeAll(() => {
    healthService.initialize('test-service', '1.0.0');
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = HealthService.getInstance();
      const instance2 = HealthService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('registerCheck', () => {
    it('should register a health check', () => {
      const check = {
        name: 'test-check',
        check: async () => ({ status: 'healthy' as const })
      };

      expect(() => {
        healthService.registerCheck(check);
      }).not.toThrow();
    });
  });

  describe('runCheck', () => {
    beforeEach(() => {
      healthService.registerCheck({
        name: 'healthy-check',
        check: async () => ({ status: 'healthy' as const, message: 'All good' })
      });

      healthService.registerCheck({
        name: 'unhealthy-check',
        check: async () => ({ status: 'unhealthy' as const, message: 'Failed' })
      });

      healthService.registerCheck({
        name: 'error-check',
        check: async () => {
          throw new Error('Check failed');
        }
      });
    });

    it('should run healthy check', async () => {
      const result = await healthService.runCheck('healthy-check');
      expect(result.status).toBe('healthy');
      expect(result.message).toBe('All good');
      expect(result.latencyMs).toBeDefined();
    });

    it('should run unhealthy check', async () => {
      const result = await healthService.runCheck('unhealthy-check');
      expect(result.status).toBe('unhealthy');
    });

    it('should handle check errors', async () => {
      const result = await healthService.runCheck('error-check');
      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Check failed');
    });

    it('should return unhealthy for non-existent check', async () => {
      const result = await healthService.runCheck('non-existent');
      expect(result.status).toBe('unhealthy');
    });
  });

  describe('getHealth', () => {
    it('should return overall health status', async () => {
      const health = await healthService.getHealth();

      expect(health.service).toBe('test-service');
      expect(health.version).toBe('1.0.0');
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.status).toBeDefined();
      expect(health.checks).toBeDefined();
    });
  });

  describe('isHealthy', () => {
    it('should return boolean', async () => {
      const isHealthy = await healthService.isHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('isReady', () => {
    it('should return boolean', async () => {
      const isReady = await healthService.isReady();
      expect(typeof isReady).toBe('boolean');
    });
  });
});

describe('healthChecks factories', () => {
  describe('database', () => {
    it('should create healthy database check', async () => {
      const check = healthChecks.database('test-db', async () => true);
      const result = await check.check();
      expect(result.status).toBe('healthy');
    });

    it('should create unhealthy database check', async () => {
      const check = healthChecks.database('test-db', async () => false);
      const result = await check.check();
      expect(result.status).toBe('unhealthy');
    });

    it('should handle database check errors', async () => {
      const check = healthChecks.database('test-db', async () => {
        throw new Error('Connection failed');
      });
      const result = await check.check();
      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Connection failed');
    });
  });

  describe('redis', () => {
    it('should create healthy redis check', async () => {
      const check = healthChecks.redis('test-redis', async () => 'PONG');
      const result = await check.check();
      expect(result.status).toBe('healthy');
    });

    it('should create degraded redis check for unexpected response', async () => {
      const check = healthChecks.redis('test-redis', async () => 'unexpected');
      const result = await check.check();
      expect(result.status).toBe('degraded');
    });
  });

  describe('memory', () => {
    it('should create memory check', async () => {
      const check = healthChecks.memory(90);
      const result = await check.check();
      expect(['healthy', 'degraded']).toContain(result.status);
    });
  });

  describe('externalService', () => {
    it('should create external service check', async () => {
      const check = healthChecks.externalService('test-service', 'http://localhost:9999', 100);
      const result = await check.check();
      // Will likely fail since localhost:9999 probably isn't running
      expect(result.status).toBe('unhealthy');
    });
  });
});
