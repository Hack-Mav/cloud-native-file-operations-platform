import { Request, Response, RequestHandler } from 'express';
import { HealthCheck, HealthCheckResult, ServiceHealth } from './types';
import { metricsService } from './metrics';

export class HealthService {
  private static instance: HealthService;
  private checks: Map<string, HealthCheck> = new Map();
  private serviceName: string = 'unknown';
  private serviceVersion: string = '1.0.0';
  private startTime: number = Date.now();

  private constructor() {}

  static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
    }
    return HealthService.instance;
  }

  initialize(serviceName: string, serviceVersion: string): void {
    this.serviceName = serviceName;
    this.serviceVersion = serviceVersion;
    this.startTime = Date.now();

    // Create health check metric
    const healthGauge = metricsService.createGauge(
      'health_check_status',
      'Health check status (1 = healthy, 0 = unhealthy, 0.5 = degraded)',
      ['check']
    );

    // Update metrics periodically
    setInterval(async () => {
      const results = await this.runAllChecks();
      for (const [name, result] of Object.entries(results)) {
        const value = result.status === 'healthy' ? 1 : result.status === 'degraded' ? 0.5 : 0;
        healthGauge.set({ check: name }, value);
      }
    }, 30000); // Every 30 seconds
  }

  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  removeCheck(name: string): void {
    this.checks.delete(name);
  }

  async runCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      return {
        status: 'unhealthy',
        message: `Health check '${name}' not found`
      };
    }

    const startTime = Date.now();
    try {
      const result = await check.check();
      return {
        ...result,
        latencyMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime
      };
    }
  }

  async runAllChecks(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};

    const checkPromises = Array.from(this.checks.entries()).map(async ([name, check]) => {
      results[name] = await this.runCheck(name);
    });

    await Promise.all(checkPromises);
    return results;
  }

  async getHealth(): Promise<ServiceHealth> {
    const checks = await this.runAllChecks();

    // Determine overall status
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    for (const result of Object.values(checks)) {
      if (result.status === 'unhealthy') {
        overallStatus = 'unhealthy';
        break;
      }
      if (result.status === 'degraded') {
        overallStatus = 'degraded';
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      version: this.serviceVersion,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks
    };
  }

  async isHealthy(): Promise<boolean> {
    const health = await this.getHealth();
    return health.status === 'healthy';
  }

  async isReady(): Promise<boolean> {
    const health = await this.getHealth();
    return health.status !== 'unhealthy';
  }
}

export const healthService = HealthService.getInstance();

// Common health check factories
export const healthChecks = {
  /**
   * Create a database health check
   */
  database(name: string, checkFn: () => Promise<boolean>): HealthCheck {
    return {
      name: `database:${name}`,
      check: async () => {
        try {
          const isHealthy = await checkFn();
          return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            message: isHealthy ? 'Database connection is healthy' : 'Database connection failed'
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Database check failed'
          };
        }
      }
    };
  },

  /**
   * Create a Redis health check
   */
  redis(name: string, pingFn: () => Promise<string>): HealthCheck {
    return {
      name: `redis:${name}`,
      check: async () => {
        try {
          const result = await pingFn();
          return {
            status: result === 'PONG' ? 'healthy' : 'degraded',
            message: result === 'PONG' ? 'Redis connection is healthy' : `Unexpected response: ${result}`
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Redis check failed'
          };
        }
      }
    };
  },

  /**
   * Create an external service health check
   */
  externalService(name: string, url: string, timeoutMs: number = 5000): HealthCheck {
    return {
      name: `external:${name}`,
      check: async () => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);

          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal
          });

          clearTimeout(timeout);

          if (response.ok) {
            return { status: 'healthy', message: `${name} is reachable` };
          }
          return {
            status: 'degraded',
            message: `${name} returned status ${response.status}`
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: error instanceof Error ? error.message : `Failed to reach ${name}`
          };
        }
      }
    };
  },

  /**
   * Create a memory usage health check
   */
  memory(thresholdPercent: number = 90): HealthCheck {
    return {
      name: 'memory',
      check: async () => {
        const used = process.memoryUsage();
        const heapUsedPercent = (used.heapUsed / used.heapTotal) * 100;

        if (heapUsedPercent > thresholdPercent) {
          return {
            status: 'degraded',
            message: `Memory usage is high: ${heapUsedPercent.toFixed(1)}%`,
            details: {
              heapUsed: used.heapUsed,
              heapTotal: used.heapTotal,
              external: used.external,
              rss: used.rss
            }
          };
        }

        return {
          status: 'healthy',
          message: `Memory usage: ${heapUsedPercent.toFixed(1)}%`,
          details: {
            heapUsed: used.heapUsed,
            heapTotal: used.heapTotal
          }
        };
      }
    };
  },

  /**
   * Create a disk space health check (for Node.js environments)
   */
  diskSpace(path: string, thresholdPercent: number = 90): HealthCheck {
    return {
      name: `disk:${path}`,
      check: async () => {
        try {
          const { statfs } = await import('fs/promises');
          const stats = await statfs(path);
          const usedPercent = ((stats.blocks - stats.bfree) / stats.blocks) * 100;

          if (usedPercent > thresholdPercent) {
            return {
              status: 'degraded',
              message: `Disk usage is high: ${usedPercent.toFixed(1)}%`,
              details: {
                total: stats.blocks * stats.bsize,
                free: stats.bfree * stats.bsize
              }
            };
          }

          return {
            status: 'healthy',
            message: `Disk usage: ${usedPercent.toFixed(1)}%`
          };
        } catch (error) {
          return {
            status: 'healthy', // Don't fail if disk check is not supported
            message: 'Disk check not available'
          };
        }
      }
    };
  }
};

// Express endpoint handlers
export function healthEndpoint(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const health = await healthService.getHealth();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  };
}

export function livenessEndpoint(): RequestHandler {
  return (req: Request, res: Response): void => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  };
}

export function readinessEndpoint(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const isReady = await healthService.isReady();
    res.status(isReady ? 200 : 503).json({
      ready: isReady,
      timestamp: new Date().toISOString()
    });
  };
}
