import { Request, Response, NextFunction } from 'express';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

export interface RateLimitStore {
  get(key: string): Promise<number | null>;
  set(key: string, value: number, ttlMs: number): Promise<void>;
  increment(key: string, ttlMs: number): Promise<number>;
  delete(key: string): Promise<void>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();

  async get(key: string): Promise<number | null> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.resetTime) {
      return null;
    }
    return entry.count;
  }

  async set(key: string, value: number, ttlMs: number): Promise<void> {
    this.store.set(key, {
      count: value,
      resetTime: Date.now() + ttlMs
    });
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const entry = this.store.get(key);
    const now = Date.now();

    if (!entry || now > entry.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + ttlMs });
      return 1;
    }

    entry.count++;
    return entry.count;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redisClient: any) {}

  async get(key: string): Promise<number | null> {
    const value = await this.redisClient.get(key);
    return value ? parseInt(value, 10) : null;
  }

  async set(key: string, value: number, ttlMs: number): Promise<void> {
    await this.redisClient.setex(key, Math.ceil(ttlMs / 1000), value);
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const multi = this.redisClient.multi();
    multi.incr(key);
    multi.expire(key, Math.ceil(ttlMs / 1000));
    const results = await multi.exec();
    return results[0][1];
  }

  async delete(key: string): Promise<void> {
    await this.redisClient.del(key);
  }
}

export class RateLimitService {
  private store: RateLimitStore;

  constructor(store?: RateLimitStore) {
    this.store = store || new MemoryRateLimitStore();
    
    // Start cleanup interval for memory store
    if (this.store instanceof MemoryRateLimitStore) {
      setInterval(() => {
        this.store.cleanup();
      }, 60000); // Cleanup every minute
    }
  }

  /**
   * Create rate limiting middleware
   */
  createMiddleware(config: RateLimitConfig) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const key = this.generateKey(req, config.keyGenerator);
        const current = await this.store.increment(key, config.windowMs);

        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': Math.max(0, config.maxRequests - current).toString(),
          'X-RateLimit-Reset': new Date(Date.now() + config.windowMs).toISOString()
        });

        if (current > config.maxRequests) {
          // Rate limit exceeded
          if (config.onLimitReached) {
            config.onLimitReached(req, res);
          }

          return res.status(429).json({
            error: config.message || 'Too many requests',
            code: 'RATE_LIMITED',
            retryAfter: Math.ceil(config.windowMs / 1000)
          });
        }

        next();
      } catch (error) {
        console.error('Rate limiting error:', error);
        // If rate limiting fails, allow the request to continue
        next();
      }
    };
  }

  /**
   * Create different rate limit configurations for different endpoints
   */
  static createConfigs() {
    return {
      // Strict rate limiting for authentication endpoints
      auth: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5, // 5 attempts per 15 minutes
        message: 'Too many authentication attempts'
      },

      // Moderate rate limiting for API endpoints
      api: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100, // 100 requests per minute
        message: 'API rate limit exceeded'
      },

      // Lenient rate limiting for GraphQL
      graphql: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 200, // 200 requests per minute
        message: 'GraphQL rate limit exceeded'
      },

      // Very strict for sensitive operations
      sensitive: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 10, // 10 requests per hour
        message: 'Sensitive operation rate limit exceeded'
      },

      // Per-user rate limiting
      perUser: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60, // 60 requests per minute per user
        keyGenerator: (req: Request) => `user:${req.user?.id || req.ip}`,
        message: 'User rate limit exceeded'
      }
    };
  }

  private generateKey(req: Request, keyGenerator?: (req: Request) => string): string {
    if (keyGenerator) {
      return keyGenerator(req);
    }

    // Default key generation based on IP and user
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = req.user?.id;
    
    return userId ? `user:${userId}` : `ip:${ip}`;
  }

  /**
   * Check rate limit without incrementing
   */
  async checkLimit(key: string, config: RateLimitConfig): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetTime: number;
  }> {
    const current = await this.store.get(key) || 0;
    const remaining = Math.max(0, config.maxRequests - current);
    const resetTime = Date.now() + config.windowMs;

    return {
      allowed: current < config.maxRequests,
      current,
      remaining,
      resetTime
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetLimit(key: string): Promise<void> {
    await this.store.delete(key);
  }
}