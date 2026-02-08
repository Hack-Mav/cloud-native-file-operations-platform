import { serviceDiscovery, ServiceInstance } from './serviceDiscovery';
import { circuitBreakerManager } from '../utils/circuitBreaker';

export type LoadBalancingStrategy = 'round-robin' | 'least-connections' | 'random' | 'weighted';

interface ServiceStats {
  activeConnections: number;
  totalRequests: number;
  lastUsed: Date;
}

class LoadBalancer {
  private serviceStats: Map<string, ServiceStats> = new Map();
  private roundRobinCounters: Map<string, number> = new Map();
  private strategy: LoadBalancingStrategy = 'round-robin';

  constructor(strategy: LoadBalancingStrategy = 'round-robin') {
    this.strategy = strategy;
  }

  async getServiceInstance(serviceName: string): Promise<ServiceInstance> {
    const instances = await serviceDiscovery.getServiceInstances(serviceName);
    
    if (instances.length === 0) {
      throw new Error(`No healthy instances available for service: ${serviceName}`);
    }

    // Filter out instances with open circuit breakers
    const availableInstances = instances.filter(instance => {
      const breaker = circuitBreakerManager.get(`${serviceName}-${instance.id}`);
      return !breaker || !breaker.isOpen();
    });

    if (availableInstances.length === 0) {
      throw new Error(`All instances for service ${serviceName} are circuit broken`);
    }

    if (availableInstances.length === 1) {
      this.updateStats(availableInstances[0].id);
      return availableInstances[0];
    }

    let selectedInstance: ServiceInstance;

    switch (this.strategy) {
      case 'round-robin':
        selectedInstance = this.roundRobinSelection(serviceName, availableInstances);
        break;
      case 'least-connections':
        selectedInstance = this.leastConnectionsSelection(availableInstances);
        break;
      case 'random':
        selectedInstance = this.randomSelection(availableInstances);
        break;
      case 'weighted':
        selectedInstance = this.weightedSelection(availableInstances);
        break;
      default:
        selectedInstance = this.roundRobinSelection(serviceName, availableInstances);
    }

    this.updateStats(selectedInstance.id);
    return selectedInstance;
  }

  private roundRobinSelection(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    const currentCounter = this.roundRobinCounters.get(serviceName) || 0;
    const selectedIndex = currentCounter % instances.length;
    this.roundRobinCounters.set(serviceName, currentCounter + 1);
    return instances[selectedIndex];
  }

  private leastConnectionsSelection(instances: ServiceInstance[]): ServiceInstance {
    let selectedInstance = instances[0];
    let minConnections = this.getStats(selectedInstance.id).activeConnections;

    for (const instance of instances) {
      const connections = this.getStats(instance.id).activeConnections;
      if (connections < minConnections) {
        minConnections = connections;
        selectedInstance = instance;
      }
    }

    return selectedInstance;
  }

  private randomSelection(instances: ServiceInstance[]): ServiceInstance {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  private weightedSelection(instances: ServiceInstance[]): ServiceInstance {
    // Simple weighted selection based on inverse of active connections
    const weights = instances.map(instance => {
      const stats = this.getStats(instance.id);
      // Higher weight for instances with fewer connections
      return Math.max(1, 100 - stats.activeConnections);
    });

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < instances.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return instances[i];
      }
    }

    // Fallback to last instance
    return instances[instances.length - 1];
  }

  private getStats(instanceId: string): ServiceStats {
    if (!this.serviceStats.has(instanceId)) {
      this.serviceStats.set(instanceId, {
        activeConnections: 0,
        totalRequests: 0,
        lastUsed: new Date()
      });
    }
    return this.serviceStats.get(instanceId)!;
  }

  private updateStats(instanceId: string): void {
    const stats = this.getStats(instanceId);
    stats.totalRequests++;
    stats.lastUsed = new Date();
  }

  incrementConnections(instanceId: string): void {
    const stats = this.getStats(instanceId);
    stats.activeConnections++;
  }

  decrementConnections(instanceId: string): void {
    const stats = this.getStats(instanceId);
    stats.activeConnections = Math.max(0, stats.activeConnections - 1);
  }

  getServiceStats(): Map<string, ServiceStats> {
    return new Map(this.serviceStats);
  }

  resetStats(instanceId?: string): void {
    if (instanceId) {
      this.serviceStats.delete(instanceId);
    } else {
      this.serviceStats.clear();
      this.roundRobinCounters.clear();
    }
  }

  setStrategy(strategy: LoadBalancingStrategy): void {
    this.strategy = strategy;
    console.log(`Load balancing strategy changed to: ${strategy}`);
  }

  getStrategy(): LoadBalancingStrategy {
    return this.strategy;
  }
}

export const loadBalancer = new LoadBalancer(
  (process.env.LOAD_BALANCING_STRATEGY as LoadBalancingStrategy) || 'round-robin'
);