import { Request, Response, NextFunction } from 'express';
import Redis from 'redis';

interface DDoSConfig {
  windowMs: number;
  maxRequests: number;
  maxRequestsPerSecond: number;
  suspiciousThreshold: number;
  blockDuration: number;
  whitelistedIPs: string[];
}

interface RequestStats {
  count: number;
  firstRequest: number;
  lastRequest: number;
  suspicious: boolean;
}

class DDoSProtection {
  private redis: Redis.RedisClientType;
  private connected: boolean = false;
  private localStats: Map<string, RequestStats> = new Map();
  private blockedIPs: Set<string> = new Set();
  
  private config: DDoSConfig = {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    maxRequestsPerSecond: 10,
    suspiciousThreshold: 50,
    blockDuration: 300000, // 5 minutes
    whitelistedIPs: ['127.0.0.1', '::1']
  };

  constructor(config?: Partial<DDoSConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_delay_on_failure: 100,
      retry_delay_on_cluster_down: 300,
      retry_delay_on_failover: 100,
      max_attempts: 3
    });

    this.redis.on('error', (err) => {
      console.error('Redis DDoS protection error:', err);
      this.connected = false;
    });

    this.redis.on('connect', () => {
      console.log('DDoS protection connected to Redis');
      this.connected = true;
    });

    this.initialize();
    this.startCleanupInterval();
  }

  private async initialize(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      console.error('Failed to connect to Redis for DDoS protection:', error);
    }
  }

  async checkRequest(req: Request): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  }> {
    const clientIP = this.getClientIP(req);
    
    // Check whitelist
    if (this.config.whitelistedIPs.includes(clientIP)) {
      return { allowed: true };
    }

    // Check if IP is blocked
    if (this.blockedIPs.has(clientIP)) {
      return {
        allowed: false,
        reason: 'IP_BLOCKED_DDOS',
        retryAfter: Math.ceil(this.config.blockDuration / 1000)
      };
    }

    const now = Date.now();
    
    try {
      // Use Redis if available, otherwise fall back to local stats
      if (this.connected) {
        return await this.checkWithRedis(clientIP, now);
      } else {
        return this.checkWithLocalStats(clientIP, now);
      }
    } catch (error) {
      console.error('DDoS check error:', error);
      // Fail open on errors
      return { allowed: true };
    }
  }

  private async checkWithRedis(clientIP: string, now: number): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  }> {
    const key = `ddos:${clientIP}`;
    const pipeline = this.redis.multi();
    
    // Increment request count
    pipeline.incr(key);
    pipeline.expire(key, Math.ceil(this.config.windowMs / 1000));
    
    // Get current count
    const results = await pipeline.exec();
    const requestCount = results?.[0] as number || 1;
    
    // Check rate limits
    if (requestCount > this.config.maxRequests) {
      await this.blockIP(clientIP, 'RATE_LIMIT_EXCEEDED');
      return {
        allowed: false,
        reason: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(this.config.blockDuration / 1000)
      };
    }

    // Check requests per second (using a shorter window)
    const rpsKey = `ddos:rps:${clientIP}:${Math.floor(now / 1000)}`;
    const rpsCount = await this.redis.incr(rpsKey);
    await this.redis.expire(rpsKey, 1);
    
    if (rpsCount > this.config.maxRequestsPerSecond) {
      await this.blockIP(clientIP, 'RPS_LIMIT_EXCEEDED');
      return {
        allowed: false,
        reason: 'RPS_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(this.config.blockDuration / 1000)
      };
    }

    // Mark as suspicious if approaching limits
    if (requestCount > this.config.suspiciousThreshold) {
      await this.markSuspicious(clientIP);
    }

    return { allowed: true };
  }

  private checkWithLocalStats(clientIP: string, now: number): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    let stats = this.localStats.get(clientIP);
    
    if (!stats) {
      stats = {
        count: 0,
        firstRequest: now,
        lastRequest: now,
        suspicious: false
      };
      this.localStats.set(clientIP, stats);
    }

    // Reset stats if window expired
    if (now - stats.firstRequest > this.config.windowMs) {
      stats.count = 0;
      stats.firstRequest = now;
      stats.suspicious = false;
    }

    stats.count++;
    stats.lastRequest = now;

    // Check rate limits
    if (stats.count > this.config.maxRequests) {
      this.blockIP(clientIP, 'RATE_LIMIT_EXCEEDED');
      return {
        allowed: false,
        reason: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(this.config.blockDuration / 1000)
      };
    }

    // Check requests per second
    const timeWindow = now - stats.firstRequest;
    const rps = stats.count / (timeWindow / 1000);
    
    if (rps > this.config.maxRequestsPerSecond) {
      this.blockIP(clientIP, 'RPS_LIMIT_EXCEEDED');
      return {
        allowed: false,
        reason: 'RPS_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(this.config.blockDuration / 1000)
      };
    }

    // Mark as suspicious
    if (stats.count > this.config.suspiciousThreshold) {
      stats.suspicious = true;
    }

    return { allowed: true };
  }

  private async blockIP(ip: string, reason: string): Promise<void> {
    this.blockedIPs.add(ip);
    
    console.warn(`IP ${ip} blocked for DDoS protection: ${reason}`);
    
    // Store in Redis if available
    if (this.connected) {
      const blockKey = `ddos:blocked:${ip}`;
      await this.redis.setEx(blockKey, Math.ceil(this.config.blockDuration / 1000), reason);
    }

    // Auto-unblock after duration
    setTimeout(() => {
      this.blockedIPs.delete(ip);
      console.info(`IP ${ip} automatically unblocked`);
    }, this.config.blockDuration);
  }

  private async markSuspicious(ip: string): Promise<void> {
    if (this.connected) {
      const suspiciousKey = `ddos:suspicious:${ip}`;
      await this.redis.setEx(suspiciousKey, 3600, 'true'); // 1 hour
    }
    
    console.warn(`IP ${ip} marked as suspicious due to high request rate`);
  }

  private getClientIP(req: Request): string {
    // Get real IP, considering proxies and load balancers
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    return req.headers['x-real-ip'] as string ||
           req.connection.remoteAddress ||
           req.ip ||
           'unknown';
  }

  private startCleanupInterval(): void {
    // Clean up local stats every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [ip, stats] of this.localStats.entries()) {
        if (now - stats.lastRequest > this.config.windowMs * 2) {
          this.localStats.delete(ip);
        }
      }
    }, 300000);
  }

  // Admin methods
  async unblockIP(ip: string): Promise<void> {
    this.blockedIPs.delete(ip);
    
    if (this.connected) {
      const blockKey = `ddos:blocked:${ip}`;
      await this.redis.del(blockKey);
    }
    
    console.info(`IP ${ip} manually unblocked`);
  }

  async getBlockedIPs(): Promise<string[]> {
    const blocked = Array.from(this.blockedIPs);
    
    if (this.connected) {
      try {
        const keys = await this.redis.keys('ddos:blocked:*');
        const redisBlocked = keys.map(key => key.replace('ddos:blocked:', ''));
        return [...new Set([...blocked, ...redisBlocked])];
      } catch (error) {
        console.error('Error getting blocked IPs from Redis:', error);
      }
    }
    
    return blocked;
  }

  async getSuspiciousIPs(): Promise<string[]> {
    if (this.connected) {
      try {
        const keys = await this.redis.keys('ddos:suspicious:*');
        return keys.map(key => key.replace('ddos:suspicious:', ''));
      } catch (error) {
        console.error('Error getting suspicious IPs from Redis:', error);
      }
    }
    
    return [];
  }

  updateConfig(newConfig: Partial<DDoSConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): DDoSConfig {
    return { ...this.config };
  }

  async cleanup(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Error closing Redis DDoS protection connection:', error);
    }
  }
}

const ddosProtection = new DDoSProtection({
  windowMs: parseInt(process.env.DDOS_WINDOW_MS || '60000'),
  maxRequests: parseInt(process.env.DDOS_MAX_REQUESTS || '100'),
  maxRequestsPerSecond: parseInt(process.env.DDOS_MAX_RPS || '10'),
  suspiciousThreshold: parseInt(process.env.DDOS_SUSPICIOUS_THRESHOLD || '50'),
  blockDuration: parseInt(process.env.DDOS_BLOCK_DURATION || '300000'),
  whitelistedIPs: (process.env.DDOS_WHITELIST || '127.0.0.1,::1').split(',')
});

export function ddosProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  ddosProtection.checkRequest(req)
    .then(result => {
      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter || 300);
        return res.status(429).json({
          error: {
            code: 'DDOS_PROTECTION',
            message: 'Request blocked by DDoS protection',
            reason: result.reason,
            retryAfter: result.retryAfter,
            timestamp: new Date().toISOString(),
            requestId: req.correlationId
          }
        });
      }
      
      next();
    })
    .catch(error => {
      console.error('DDoS protection middleware error:', error);
      // Continue on error (fail open)
      next();
    });
}

export { ddosProtection };