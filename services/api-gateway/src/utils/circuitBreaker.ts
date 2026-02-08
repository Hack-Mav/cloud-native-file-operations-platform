export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedErrorRate: number;
  minimumRequests: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private resetTimer?: NodeJS.Timeout;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        console.log(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.totalRequests++;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      this.reset();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.totalRequests++;
    this.lastFailureTime = new Date();

    if (this.shouldTrip()) {
      this.trip();
    }
  }

  private shouldTrip(): boolean {
    if (this.totalRequests < this.config.minimumRequests) {
      return false;
    }

    const errorRate = this.failureCount / this.totalRequests;
    return errorRate >= this.config.expectedErrorRate ||
           this.failureCount >= this.config.failureThreshold;
  }

  private shouldAttemptReset(): boolean {
    return this.nextAttemptTime ? new Date() >= this.nextAttemptTime : false;
  }

  private trip(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    
    console.warn(`Circuit breaker ${this.name} tripped to OPEN state`, {
      failureCount: this.failureCount,
      totalRequests: this.totalRequests,
      errorRate: this.failureCount / this.totalRequests,
      nextAttemptTime: this.nextAttemptTime
    });

    // Clear any existing reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    // Set timer to automatically transition to HALF_OPEN
    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.state = CircuitState.HALF_OPEN;
        console.log(`Circuit breaker ${this.name} automatically transitioned to HALF_OPEN`);
      }
    }, this.config.resetTimeout);
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.nextAttemptTime = undefined;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    console.log(`Circuit breaker ${this.name} reset to CLOSED state`);
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  getName(): string {
    return this.name;
  }

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }

  // Manual controls
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    console.log(`Circuit breaker ${this.name} manually forced to OPEN`);
  }

  forceClose(): void {
    this.reset();
    console.log(`Circuit breaker ${this.name} manually forced to CLOSED`);
  }

  forceHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    console.log(`Circuit breaker ${this.name} manually forced to HALF_OPEN`);
  }
}

// Circuit breaker manager for multiple services
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 10000, // 10 seconds
    expectedErrorRate: 0.5, // 50%
    minimumRequests: 10
  };

  getOrCreate(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      const finalConfig = { ...this.defaultConfig, ...config };
      const breaker = new CircuitBreaker(serviceName, finalConfig);
      this.breakers.set(serviceName, breaker);
    }

    return this.breakers.get(serviceName)!;
  }

  get(serviceName: string): CircuitBreaker | undefined {
    return this.breakers.get(serviceName);
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }

  getHealthyServices(): string[] {
    const healthy: string[] = [];
    
    for (const [name, breaker] of this.breakers) {
      if (breaker.isClosed() || breaker.isHalfOpen()) {
        healthy.push(name);
      }
    }
    
    return healthy;
  }

  getUnhealthyServices(): string[] {
    const unhealthy: string[] = [];
    
    for (const [name, breaker] of this.breakers) {
      if (breaker.isOpen()) {
        unhealthy.push(name);
      }
    }
    
    return unhealthy;
  }

  // Bulk operations
  forceOpenAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceOpen();
    }
  }

  forceCloseAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClose();
    }
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClose();
    }
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();