import { Request, Response, NextFunction } from 'express';
import Redis from 'redis';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

class RateLimiter {
  private redis: Redis.RedisClientType;
  private connected: boolean = false;

  constructor() {
    this.redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_delay_on_failure: 100,
      retry_delay_on_cluster_down: 300,
      retry_delay_on_failover: 100,
      max_attempts: 3
    });

    this.redis.on('error', (err) => {
      console.error('Redis rate limiter error:', err);
      this.connected = false;
    });

    this.redis.on('connect', () => {
      console.log('Rate limiter connected to Redis');
      this.connected = true;
    });

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      console.error('Failed to connect to Redis for rate limiting:', error);
    }
  }

  async checkRateLimit(key: string, config: RateLimitConfig): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    totalHits: number;
  }> {
    if (!this.connected) {
      // If Redis is not available, allow all requests (fail open)
      return {
        allowed: true,
        remaining: config.max - 1,
        resetTime: Date.now() + config.windowMs,
        totalHits: 1
      };
    }

    const now = Date.now();
    const window = Math.floor(now / config.windowMs);
    const redisKey = `rate_limit:${key}:${window}`;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.multi();
      pipeline.incr(redisKey);
      pipeline.expire(redisKey, Math.ceil(config.windowMs / 1000));
      
      const results = await pipeline.exec();
      const totalHits = results?.[0] as number || 1;

      const remaining = Math.max(0, config.max - totalHits);
      const resetTime = (window + 1) * config.windowMs;

      return {
        allowed: totalHits <= config.max,
        remaining,
        resetTime,
        totalHits
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Fail open on Redis errors
      return {
        allowed: true,
        remaining: config.max - 1,
        resetTime: now + config.windowMs,
        totalHits: 1
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Error closing Redis rate limiter connection:', error);
    }
  }
}

const rateLimiter = new RateLimiter();

// Default rate limit configuration
const defaultConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  keyGenerator: (req: Request) => {
    // Use IP address and user ID (if authenticated) for rate limiting
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = req.user?.id;
    return userId ? `user:${userId}` : `ip:${ip}`;
  }
};

export function rateLimitMiddleware(config?: Partial<RateLimitConfig>) {
  const finalConfig = { ...defaultConfig, ...config };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = finalConfig.keyGenerator!(req);
      const result = await rateLimiter.checkRateLimit(key, finalConfig);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', finalConfig.max);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        // Rate limit exceeded
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: finalConfig.message,
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
            limit: finalConfig.max,
            remaining: result.remaining,
            resetTime: new Date(result.resetTime).toISOString(),
            requestId: req.correlationId
          }
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Continue on error (fail open)
      next();
    }
  };
}

// API key based rate limiting
export function apiKeyRateLimit(config?: Partial<RateLimitConfig>) {
  const finalConfig = {
    ...defaultConfig,
    ...config,
    keyGenerator: (req: Request) => {
      const apiKey = req.headers['x-api-key'] as string;
      return apiKey ? `api_key:${apiKey}` : `ip:${req.ip || 'unknown'}`;
    }
  };

  return rateLimitMiddleware(finalConfig);
}

// User-based rate limiting
export function userRateLimit(config?: Partial<RateLimitConfig>) {
  const finalConfig = {
    ...defaultConfig,
    ...config,
    keyGenerator: (req: Request) => {
      const userId = req.user?.id;
      return userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`;
    }
  };

  return rateLimitMiddleware(finalConfig);
}

// Cleanup function for graceful shutdown
export async function cleanupRateLimiter(): Promise<void> {
  await rateLimiter.cleanup();
}