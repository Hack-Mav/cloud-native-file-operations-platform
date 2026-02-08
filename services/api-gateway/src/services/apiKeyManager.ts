import Redis from 'redis';
import { randomBytes, createHash } from 'crypto';

export interface APIKey {
  id: string;
  key: string;
  hashedKey: string;
  name: string;
  description?: string;
  clientId: string;
  scopes: string[];
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
  quotas?: {
    daily?: number;
    monthly?: number;
  };
  isActive: boolean;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  usageCount: number;
  metadata?: Record<string, any>;
}

export interface APIKeyUsage {
  keyId: string;
  timestamp: Date;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
}

class APIKeyManager {
  private redis: Redis.RedisClientType;
  private connected: boolean = false;
  private localKeys: Map<string, APIKey> = new Map();

  constructor() {
    this.redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_delay_on_failure: 100,
      retry_delay_on_cluster_down: 300,
      retry_delay_on_failover: 100,
      max_attempts: 3
    });

    this.redis.on('error', (err) => {
      console.error('Redis API key manager error:', err);
      this.connected = false;
    });

    this.redis.on('connect', () => {
      console.log('API key manager connected to Redis');
      this.connected = true;
    });

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      await this.loadKeysFromStorage();
    } catch (error) {
      console.error('Failed to initialize API key manager:', error);
      this.loadDefaultKeys();
    }
  }

  private async loadKeysFromStorage(): Promise<void> {
    if (!this.connected) return;

    try {
      const keys = await this.redis.keys('api_key:*');
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const apiKey = JSON.parse(data) as APIKey;
          apiKey.createdAt = new Date(apiKey.createdAt);
          if (apiKey.expiresAt) {
            apiKey.expiresAt = new Date(apiKey.expiresAt);
          }
          if (apiKey.lastUsedAt) {
            apiKey.lastUsedAt = new Date(apiKey.lastUsedAt);
          }
          this.localKeys.set(apiKey.hashedKey, apiKey);
        }
      }
      console.log(`Loaded ${this.localKeys.size} API keys from storage`);
    } catch (error) {
      console.error('Error loading API keys from storage:', error);
    }
  }

  private loadDefaultKeys(): void {
    // Load default API keys from environment
    const defaultKeys = process.env.VALID_API_KEYS?.split(',') || [];
    
    defaultKeys.forEach((key, index) => {
      const hashedKey = this.hashKey(key);
      const apiKey: APIKey = {
        id: `default-${index + 1}`,
        key: key,
        hashedKey,
        name: `Default Key ${index + 1}`,
        clientId: 'default-client',
        scopes: ['read', 'write'],
        isActive: true,
        createdAt: new Date(),
        usageCount: 0
      };
      this.localKeys.set(hashedKey, apiKey);
    });
  }

  async createAPIKey(params: {
    name: string;
    description?: string;
    clientId: string;
    scopes: string[];
    rateLimit?: { windowMs: number; maxRequests: number };
    quotas?: { daily?: number; monthly?: number };
    expiresIn?: number; // milliseconds
    metadata?: Record<string, any>;
  }): Promise<{ apiKey: APIKey; plainKey: string }> {
    const plainKey = this.generateKey();
    const hashedKey = this.hashKey(plainKey);
    
    const apiKey: APIKey = {
      id: randomBytes(16).toString('hex'),
      key: plainKey,
      hashedKey,
      name: params.name,
      description: params.description,
      clientId: params.clientId,
      scopes: params.scopes,
      rateLimit: params.rateLimit,
      quotas: params.quotas,
      isActive: true,
      createdAt: new Date(),
      expiresAt: params.expiresIn ? new Date(Date.now() + params.expiresIn) : undefined,
      usageCount: 0,
      metadata: params.metadata
    };

    // Store in local cache
    this.localKeys.set(hashedKey, apiKey);

    // Store in Redis
    if (this.connected) {
      try {
        const redisKey = `api_key:${apiKey.id}`;
        await this.redis.set(redisKey, JSON.stringify(apiKey));
        
        // Set expiration if specified
        if (apiKey.expiresAt) {
          const ttl = Math.ceil((apiKey.expiresAt.getTime() - Date.now()) / 1000);
          await this.redis.expire(redisKey, ttl);
        }
      } catch (error) {
        console.error('Error storing API key in Redis:', error);
      }
    }

    console.log(`Created API key: ${apiKey.name} for client: ${apiKey.clientId}`);
    
    // Return without the plain key in the stored object
    const storedKey = { ...apiKey };
    delete storedKey.key;
    
    return { apiKey: storedKey, plainKey };
  }

  async validateAPIKey(key: string): Promise<{
    valid: boolean;
    apiKey?: APIKey;
    reason?: string;
  }> {
    const hashedKey = this.hashKey(key);
    let apiKey = this.localKeys.get(hashedKey);

    // If not in local cache, try Redis
    if (!apiKey && this.connected) {
      try {
        const keys = await this.redis.keys('api_key:*');
        for (const redisKey of keys) {
          const data = await this.redis.get(redisKey);
          if (data) {
            const storedKey = JSON.parse(data) as APIKey;
            if (storedKey.hashedKey === hashedKey) {
              apiKey = storedKey;
              apiKey.createdAt = new Date(apiKey.createdAt);
              if (apiKey.expiresAt) {
                apiKey.expiresAt = new Date(apiKey.expiresAt);
              }
              if (apiKey.lastUsedAt) {
                apiKey.lastUsedAt = new Date(apiKey.lastUsedAt);
              }
              this.localKeys.set(hashedKey, apiKey);
              break;
            }
          }
        }
      } catch (error) {
        console.error('Error validating API key from Redis:', error);
      }
    }

    if (!apiKey) {
      return { valid: false, reason: 'API key not found' };
    }

    if (!apiKey.isActive) {
      return { valid: false, reason: 'API key is inactive' };
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, reason: 'API key has expired' };
    }

    // Update last used timestamp
    await this.updateLastUsed(apiKey.id);

    return { valid: true, apiKey };
  }

  async checkQuota(keyId: string, endpoint: string): Promise<{
    allowed: boolean;
    remaining?: number;
    resetTime?: Date;
  }> {
    if (!this.connected) {
      return { allowed: true }; // Fail open if Redis unavailable
    }

    const apiKey = Array.from(this.localKeys.values()).find(k => k.id === keyId);
    if (!apiKey?.quotas) {
      return { allowed: true };
    }

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const month = now.toISOString().substring(0, 7);

      // Check daily quota
      if (apiKey.quotas.daily) {
        const dailyKey = `quota:daily:${keyId}:${today}`;
        const dailyUsage = await this.redis.get(dailyKey);
        const dailyCount = dailyUsage ? parseInt(dailyUsage) : 0;

        if (dailyCount >= apiKey.quotas.daily) {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          
          return {
            allowed: false,
            remaining: 0,
            resetTime: tomorrow
          };
        }
      }

      // Check monthly quota
      if (apiKey.quotas.monthly) {
        const monthlyKey = `quota:monthly:${keyId}:${month}`;
        const monthlyUsage = await this.redis.get(monthlyKey);
        const monthlyCount = monthlyUsage ? parseInt(monthlyUsage) : 0;

        if (monthlyCount >= apiKey.quotas.monthly) {
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          
          return {
            allowed: false,
            remaining: 0,
            resetTime: nextMonth
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking API key quota:', error);
      return { allowed: true }; // Fail open
    }
  }

  async recordUsage(keyId: string, usage: Omit<APIKeyUsage, 'keyId'>): Promise<void> {
    if (!this.connected) return;

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const month = now.toISOString().substring(0, 7);

      // Increment usage counters
      const dailyKey = `quota:daily:${keyId}:${today}`;
      const monthlyKey = `quota:monthly:${keyId}:${month}`;
      
      await this.redis.incr(dailyKey);
      await this.redis.expire(dailyKey, 86400); // 24 hours
      
      await this.redis.incr(monthlyKey);
      await this.redis.expire(monthlyKey, 2678400); // 31 days

      // Store detailed usage record
      const usageRecord: APIKeyUsage = { keyId, ...usage };
      const usageKey = `usage:${keyId}:${now.getTime()}`;
      await this.redis.setEx(usageKey, 604800, JSON.stringify(usageRecord)); // 7 days

      // Update local usage count
      const apiKey = Array.from(this.localKeys.values()).find(k => k.id === keyId);
      if (apiKey) {
        apiKey.usageCount++;
      }
    } catch (error) {
      console.error('Error recording API key usage:', error);
    }
  }

  async revokeAPIKey(keyId: string): Promise<boolean> {
    try {
      // Find and deactivate in local cache
      const apiKey = Array.from(this.localKeys.values()).find(k => k.id === keyId);
      if (apiKey) {
        apiKey.isActive = false;
        this.localKeys.delete(apiKey.hashedKey);
      }

      // Remove from Redis
      if (this.connected) {
        const redisKey = `api_key:${keyId}`;
        await this.redis.del(redisKey);
      }

      console.log(`Revoked API key: ${keyId}`);
      return true;
    } catch (error) {
      console.error('Error revoking API key:', error);
      return false;
    }
  }

  async listAPIKeys(clientId?: string): Promise<APIKey[]> {
    const keys = Array.from(this.localKeys.values());
    
    if (clientId) {
      return keys.filter(key => key.clientId === clientId);
    }
    
    return keys;
  }

  async getAPIKeyUsage(keyId: string, days: number = 7): Promise<APIKeyUsage[]> {
    if (!this.connected) return [];

    try {
      const pattern = `usage:${keyId}:*`;
      const keys = await this.redis.keys(pattern);
      const usage: APIKeyUsage[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const record = JSON.parse(data) as APIKeyUsage;
          record.timestamp = new Date(record.timestamp);
          usage.push(record);
        }
      }

      // Filter by days and sort by timestamp
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return usage
        .filter(record => record.timestamp >= cutoff)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.error('Error getting API key usage:', error);
      return [];
    }
  }

  private generateKey(): string {
    // Generate a secure API key
    const prefix = 'cfop'; // Cloud File Operations Platform
    const randomPart = randomBytes(32).toString('hex');
    return `${prefix}_${randomPart}`;
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private async updateLastUsed(keyId: string): Promise<void> {
    const apiKey = Array.from(this.localKeys.values()).find(k => k.id === keyId);
    if (apiKey) {
      apiKey.lastUsedAt = new Date();
      
      // Update in Redis
      if (this.connected) {
        try {
          const redisKey = `api_key:${keyId}`;
          await this.redis.set(redisKey, JSON.stringify(apiKey));
        } catch (error) {
          console.error('Error updating last used timestamp:', error);
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Error closing Redis API key manager connection:', error);
    }
  }
}

export const apiKeyManager = new APIKeyManager();