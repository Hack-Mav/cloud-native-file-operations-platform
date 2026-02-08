import Redis from 'redis';

export interface ServiceInstance {
  id: string;
  host: string;
  port: number;
  healthy: boolean;
  lastHealthCheck: Date;
  metadata?: Record<string, any>;
}

export interface ServiceRegistry {
  [serviceName: string]: ServiceInstance[];
}

class ServiceDiscovery {
  private redis: Redis.RedisClientType;
  private services: ServiceRegistry = {};
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly SERVICE_TTL = 60; // 60 seconds

  constructor() {
    this.redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_delay_on_failure: 100,
      retry_delay_on_cluster_down: 300,
      retry_delay_on_failover: 100,
      max_attempts: 3
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis for service discovery');
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      await this.loadServicesFromConfig();
      this.startHealthChecking();
      console.log('Service discovery initialized');
    } catch (error) {
      console.error('Failed to initialize service discovery:', error);
      // Fallback to static configuration
      await this.loadStaticServices();
    }
  }

  private async loadServicesFromConfig(): Promise<void> {
    // Load service instances from environment or configuration
    const serviceConfig = {
      'auth-service': [
        {
          id: 'auth-1',
          host: process.env.AUTH_SERVICE_HOST || 'localhost',
          port: parseInt(process.env.AUTH_SERVICE_PORT || '8081'),
          healthy: true,
          lastHealthCheck: new Date()
        }
      ],
      'file-service': [
        {
          id: 'file-1',
          host: process.env.FILE_SERVICE_HOST || 'localhost',
          port: parseInt(process.env.FILE_SERVICE_PORT || '8082'),
          healthy: true,
          lastHealthCheck: new Date()
        }
      ],
      'processing-service': [
        {
          id: 'processing-1',
          host: process.env.PROCESSING_SERVICE_HOST || 'localhost',
          port: parseInt(process.env.PROCESSING_SERVICE_PORT || '8083'),
          healthy: true,
          lastHealthCheck: new Date()
        }
      ],
      'notification-service': [
        {
          id: 'notification-1',
          host: process.env.NOTIFICATION_SERVICE_HOST || 'localhost',
          port: parseInt(process.env.NOTIFICATION_SERVICE_PORT || '8084'),
          healthy: true,
          lastHealthCheck: new Date()
        }
      ]
    };

    this.services = serviceConfig;

    // Register services in Redis
    for (const [serviceName, instances] of Object.entries(serviceConfig)) {
      await this.registerServiceInstances(serviceName, instances);
    }
  }

  private async loadStaticServices(): Promise<void> {
    // Fallback static configuration when Redis is unavailable
    this.services = {
      'auth-service': [
        {
          id: 'auth-static',
          host: 'localhost',
          port: 8081,
          healthy: true,
          lastHealthCheck: new Date()
        }
      ],
      'file-service': [
        {
          id: 'file-static',
          host: 'localhost',
          port: 8082,
          healthy: true,
          lastHealthCheck: new Date()
        }
      ],
      'processing-service': [
        {
          id: 'processing-static',
          host: 'localhost',
          port: 8083,
          healthy: true,
          lastHealthCheck: new Date()
        }
      ],
      'notification-service': [
        {
          id: 'notification-static',
          host: 'localhost',
          port: 8084,
          healthy: true,
          lastHealthCheck: new Date()
        }
      ]
    };
    console.log('Using static service configuration');
  }

  async registerService(serviceName: string, instance: Omit<ServiceInstance, 'lastHealthCheck'>): Promise<void> {
    const serviceInstance: ServiceInstance = {
      ...instance,
      lastHealthCheck: new Date()
    };

    if (!this.services[serviceName]) {
      this.services[serviceName] = [];
    }

    // Remove existing instance with same id
    this.services[serviceName] = this.services[serviceName].filter(s => s.id !== instance.id);
    
    // Add new instance
    this.services[serviceName].push(serviceInstance);

    try {
      // Store in Redis with TTL
      const key = `service:${serviceName}:${instance.id}`;
      await this.redis.setEx(key, this.SERVICE_TTL, JSON.stringify(serviceInstance));
      console.log(`Registered service instance: ${serviceName}/${instance.id}`);
    } catch (error) {
      console.error(`Failed to register service in Redis: ${serviceName}/${instance.id}`, error);
    }
  }

  private async registerServiceInstances(serviceName: string, instances: ServiceInstance[]): Promise<void> {
    for (const instance of instances) {
      await this.registerService(serviceName, instance);
    }
  }

  async deregisterService(serviceName: string, instanceId: string): Promise<void> {
    if (this.services[serviceName]) {
      this.services[serviceName] = this.services[serviceName].filter(s => s.id !== instanceId);
    }

    try {
      const key = `service:${serviceName}:${instanceId}`;
      await this.redis.del(key);
      console.log(`Deregistered service instance: ${serviceName}/${instanceId}`);
    } catch (error) {
      console.error(`Failed to deregister service from Redis: ${serviceName}/${instanceId}`, error);
    }
  }

  async getServiceInstances(serviceName: string): Promise<ServiceInstance[]> {
    try {
      // Try to get from Redis first
      const pattern = `service:${serviceName}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        const instances: ServiceInstance[] = [];
        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            instances.push(JSON.parse(data));
          }
        }
        return instances.filter(instance => instance.healthy);
      }
    } catch (error) {
      console.error(`Failed to get service instances from Redis for ${serviceName}:`, error);
    }

    // Fallback to local registry
    return this.services[serviceName]?.filter(instance => instance.healthy) || [];
  }

  async getHealthyServices(): Promise<ServiceRegistry> {
    const healthyServices: ServiceRegistry = {};
    
    for (const [serviceName, instances] of Object.entries(this.services)) {
      const healthyInstances = instances.filter(instance => instance.healthy);
      if (healthyInstances.length > 0) {
        healthyServices[serviceName] = healthyInstances;
      }
    }
    
    return healthyServices;
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [serviceName, instances] of Object.entries(this.services)) {
      for (const instance of instances) {
        try {
          const isHealthy = await this.checkInstanceHealth(instance);
          instance.healthy = isHealthy;
          instance.lastHealthCheck = new Date();

          if (isHealthy) {
            // Refresh TTL in Redis
            const key = `service:${serviceName}:${instance.id}`;
            await this.redis.setEx(key, this.SERVICE_TTL, JSON.stringify(instance));
          }
        } catch (error) {
          console.error(`Health check failed for ${serviceName}/${instance.id}:`, error);
          instance.healthy = false;
          instance.lastHealthCheck = new Date();
        }
      }
    }
  }

  private async checkInstanceHealth(instance: ServiceInstance): Promise<boolean> {
    try {
      const response = await fetch(`http://${instance.host}:${instance.port}/health`, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'User-Agent': 'API-Gateway-Health-Check'
        }
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
}

export const serviceDiscovery = new ServiceDiscovery();