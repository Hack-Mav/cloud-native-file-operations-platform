import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { loadBalancer } from '../src/services/loadBalancer';
import { serviceDiscovery } from '../src/services/serviceDiscovery';
import { circuitBreakerManager } from '../src/utils/circuitBreaker';

describe('Load Balancer Performance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadBalancer.resetStats();
  });

  describe('Round Robin Strategy', () => {
    it('should distribute requests evenly', async () => {
      // Mock service instances
      const mockInstances = [
        { id: 'instance-1', host: 'localhost', port: 8081, healthy: true, lastHealthCheck: new Date() },
        { id: 'instance-2', host: 'localhost', port: 8082, healthy: true, lastHealthCheck: new Date() },
        { id: 'instance-3', host: 'localhost', port: 8083, healthy: true, lastHealthCheck: new Date() }
      ];

      jest.spyOn(serviceDiscovery, 'getServiceInstances').mockResolvedValue(mockInstances);

      const selectedInstances = [];
      for (let i = 0; i < 9; i++) {
        const instance = await loadBalancer.getServiceInstance('test-service');
        selectedInstances.push(instance.id);
      }

      // Should cycle through instances evenly
      expect(selectedInstances).toEqual([
        'instance-1', 'instance-2', 'instance-3',
        'instance-1', 'instance-2', 'instance-3',
        'instance-1', 'instance-2', 'instance-3'
      ]);
    });

    it('should handle high concurrency', async () => {
      const mockInstances = [
        { id: 'instance-1', host: 'localhost', port: 8081, healthy: true, lastHealthCheck: new Date() },
        { id: 'instance-2', host: 'localhost', port: 8082, healthy: true, lastHealthCheck: new Date() }
      ];

      jest.spyOn(serviceDiscovery, 'getServiceInstances').mockResolvedValue(mockInstances);

      const promises = Array.from({ length: 100 }, () => 
        loadBalancer.getServiceInstance('test-service')
      );

      const start = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      // Check distribution
      const distribution = results.reduce((acc, instance) => {
        acc[instance.id] = (acc[instance.id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(distribution['instance-1']).toBe(50);
      expect(distribution['instance-2']).toBe(50);
    });
  });

  describe('Least Connections Strategy', () => {
    it('should select instance with fewest connections', async () => {
      loadBalancer.setStrategy('least-connections');

      const mockInstances = [
        { id: 'instance-1', host: 'localhost', port: 8081, healthy: true, lastHealthCheck: new Date() },
        { id: 'instance-2', host: 'localhost', port: 8082, healthy: true, lastHealthCheck: new Date() }
      ];

      jest.spyOn(serviceDiscovery, 'getServiceInstances').mockResolvedValue(mockInstances);

      // Simulate connections on instance-1
      loadBalancer.incrementConnections('instance-1');
      loadBalancer.incrementConnections('instance-1');

      const selectedInstance = await loadBalancer.getServiceInstance('test-service');
      
      // Should select instance-2 (fewer connections)
      expect(selectedInstance.id).toBe('instance-2');
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should exclude instances with open circuit breakers', async () => {
      const mockInstances = [
        { id: 'instance-1', host: 'localhost', port: 8081, healthy: true, lastHealthCheck: new Date() },
        { id: 'instance-2', host: 'localhost', port: 8082, healthy: true, lastHealthCheck: new Date() }
      ];

      jest.spyOn(serviceDiscovery, 'getServiceInstances').mockResolvedValue(mockInstances);

      // Open circuit breaker for instance-1
      const breaker = circuitBreakerManager.getOrCreate('test-service-instance-1');
      breaker.forceOpen();

      const selectedInstance = await loadBalancer.getServiceInstance('test-service');
      
      // Should only select instance-2
      expect(selectedInstance.id).toBe('instance-2');
    });

    it('should throw error when all instances are circuit broken', async () => {
      const mockInstances = [
        { id: 'instance-1', host: 'localhost', port: 8081, healthy: true, lastHealthCheck: new Date() },
        { id: 'instance-2', host: 'localhost', port: 8082, healthy: true, lastHealthCheck: new Date() }
      ];

      jest.spyOn(serviceDiscovery, 'getServiceInstances').mockResolvedValue(mockInstances);

      // Open circuit breakers for all instances
      circuitBreakerManager.getOrCreate('test-service-instance-1').forceOpen();
      circuitBreakerManager.getOrCreate('test-service-instance-2').forceOpen();

      await expect(loadBalancer.getServiceInstance('test-service'))
        .rejects.toThrow('All instances for service test-service are circuit broken');
    });
  });
});

describe('Service Discovery Performance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Checking', () => {
    it('should handle health check failures gracefully', async () => {
      // Mock fetch to simulate health check failure
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error('Connection refused')
      );

      const instances = await serviceDiscovery.getServiceInstances('test-service');
      
      // Should return empty array or handle gracefully
      expect(Array.isArray(instances)).toBe(true);
    });

    it('should cache service instances for performance', async () => {
      const mockInstances = [
        { id: 'instance-1', host: 'localhost', port: 8081, healthy: true, lastHealthCheck: new Date() }
      ];

      // First call
      jest.spyOn(serviceDiscovery, 'getServiceInstances').mockResolvedValueOnce(mockInstances);
      const instances1 = await serviceDiscovery.getServiceInstances('test-service');

      // Second call should use cache
      const instances2 = await serviceDiscovery.getServiceInstances('test-service');

      expect(instances1).toEqual(instances2);
    });
  });

  describe('Redis Fallback', () => {
    it('should fall back to local registry when Redis is unavailable', async () => {
      // Mock Redis error
      const mockRedis = require('redis').createClient();
      mockRedis.keys.mockRejectedValue(new Error('Redis connection failed'));

      const instances = await serviceDiscovery.getServiceInstances('auth-service');
      
      // Should return static/local instances
      expect(Array.isArray(instances)).toBe(true);
    });
  });
});

describe('Memory Usage', () => {
  it('should not leak memory during high load', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Simulate high load
    const promises = Array.from({ length: 1000 }, async (_, i) => {
      const mockInstances = [
        { id: `instance-${i % 3}`, host: 'localhost', port: 8081 + (i % 3), healthy: true, lastHealthCheck: new Date() }
      ];
      
      jest.spyOn(serviceDiscovery, 'getServiceInstances').mockResolvedValue(mockInstances);
      return loadBalancer.getServiceInstance('test-service');
    });

    await Promise.all(promises);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (less than 50MB)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  });

  it('should clean up old statistics', () => {
    // Add many service stats
    for (let i = 0; i < 1000; i++) {
      loadBalancer.incrementConnections(`instance-${i}`);
    }

    const statsBefore = loadBalancer.getServiceStats().size;
    expect(statsBefore).toBe(1000);

    // Reset stats
    loadBalancer.resetStats();

    const statsAfter = loadBalancer.getServiceStats().size;
    expect(statsAfter).toBe(0);
  });
});

describe('Response Time', () => {
  it('should have low latency for service selection', async () => {
    const mockInstances = [
      { id: 'instance-1', host: 'localhost', port: 8081, healthy: true, lastHealthCheck: new Date() }
    ];

    jest.spyOn(serviceDiscovery, 'getServiceInstances').mockResolvedValue(mockInstances);

    const iterations = 100;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await loadBalancer.getServiceInstance('test-service');
      const end = process.hrtime.bigint();
      
      times.push(Number(end - start) / 1000000); // Convert to milliseconds
    }

    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const maxTime = Math.max(...times);

    expect(averageTime).toBeLessThan(10); // Average should be less than 10ms
    expect(maxTime).toBeLessThan(50); // Max should be less than 50ms
  });
});