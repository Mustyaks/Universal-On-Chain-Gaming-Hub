/**
 * Caching layer for performance optimization
 * Implements Redis caching, cache invalidation strategies, and performance monitoring
 */

import { EventEmitter } from 'events';
import { ErrorHandler } from './ErrorHandler';
import {
  StandardizedGameData,
  PlayerGameData,
  GameAsset,
  Achievement,
  Timestamp
} from '../../types/core';

export interface CacheConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
  };
  defaultTtl: number; // seconds
  maxMemoryUsage: number; // bytes
  compressionEnabled: boolean;
  metricsEnabled: boolean;
  invalidationStrategies: InvalidationStrategy[];
}

export interface CacheKey {
  type: CacheKeyType;
  gameId: string;
  playerId?: string;
  assetId?: string;
  achievementId?: string;
  additionalParams?: Record<string, string>;
}

export type CacheKeyType = 
  | 'player_data'
  | 'game_assets'
  | 'achievements'
  | 'statistics'
  | 'aggregated_data'
  | 'validation_result'
  | 'adapter_health';

export interface InvalidationStrategy {
  name: string;
  pattern: string;
  triggers: InvalidationTrigger[];
  ttlOverride?: number;
}

export type InvalidationTrigger = 
  | 'player_update'
  | 'asset_transfer'
  | 'achievement_earned'
  | 'game_sync'
  | 'manual'
  | 'time_based';

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  averageResponseTime: number;
  memoryUsage: number;
  keyCount: number;
  evictions: number;
  errors: number;
  lastResetTime: Timestamp;
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: Timestamp;
  lastAccessed: Timestamp;
  accessCount: number;
  compressed: boolean;
  size: number;
}

export class CacheManager extends EventEmitter {
  private config: CacheConfig;
  private redisClient: any; // Redis client type
  private metrics: CacheMetrics;
  private responseTimes: number[] = [];
  private maxResponseTimeSamples = 1000;

  constructor(config: CacheConfig) {
    super();
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize the cache manager
   */
  async initialize(): Promise<void> {
    try {
      await this.initializeRedis();
      await this.setupInvalidationStrategies();
      
      console.log('Cache manager initialized successfully');
      this.emit('cache:initialized');
    } catch (error) {
      console.error('Failed to initialize cache manager:', error);
      throw error;
    }
  }

  /**
   * Get cached data
   */
  async get<T>(cacheKey: CacheKey): Promise<T | null> {
    const startTime = Date.now();
    const key = this.buildCacheKey(cacheKey);

    try {
      this.metrics.totalRequests++;

      const cachedData = await this.redisClient.get(key);
      
      if (cachedData) {
        this.metrics.hits++;
        
        const entry: CacheEntry<T> = JSON.parse(cachedData);
        
        // Update access tracking
        entry.lastAccessed = Date.now();
        entry.accessCount++;
        
        // Update cache entry with new access info
        await this.redisClient.setex(key, entry.ttl, JSON.stringify(entry));
        
        const responseTime = Date.now() - startTime;
        this.recordResponseTime(responseTime);
        
        this.emit('cache:hit', { key, responseTime });
        
        return entry.compressed ? this.decompress(entry.value) : entry.value;
      } else {
        this.metrics.misses++;
        
        const responseTime = Date.now() - startTime;
        this.recordResponseTime(responseTime);
        
        this.emit('cache:miss', { key, responseTime });
        
        return null;
      }
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache get error for key ${key}:`, error);
      
      this.emit('cache:error', { operation: 'get', key, error });
      
      return null; // Fail gracefully
    } finally {
      this.updateHitRate();
    }
  }

  /**
   * Set cached data
   */
  async set<T>(cacheKey: CacheKey, value: T, ttl?: number): Promise<void> {
    const key = this.buildCacheKey(cacheKey);
    const effectiveTtl = ttl || this.config.defaultTtl;

    try {
      const shouldCompress = this.shouldCompress(value);
      const processedValue = shouldCompress ? this.compress(value) : value;
      
      const entry: CacheEntry<T> = {
        key,
        value: processedValue,
        ttl: effectiveTtl,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        compressed: shouldCompress,
        size: this.calculateSize(processedValue)
      };

      await this.redisClient.setex(key, effectiveTtl, JSON.stringify(entry));
      
      this.emit('cache:set', { key, ttl: effectiveTtl, size: entry.size });
      
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache set error for key ${key}:`, error);
      
      this.emit('cache:error', { operation: 'set', key, error });
      
      throw error;
    }
  }

  /**
   * Delete cached data
   */
  async delete(cacheKey: CacheKey): Promise<boolean> {
    const key = this.buildCacheKey(cacheKey);

    try {
      const result = await this.redisClient.del(key);
      
      this.emit('cache:delete', { key });
      
      return result > 0;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache delete error for key ${key}:`, error);
      
      this.emit('cache:error', { operation: 'delete', key, error });
      
      return false;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redisClient.keys(`${this.config.redis.keyPrefix}:${pattern}`);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redisClient.del(...keys);
      
      this.emit('cache:invalidate_pattern', { pattern, keysDeleted: result });
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache pattern invalidation error for pattern ${pattern}:`, error);
      
      this.emit('cache:error', { operation: 'invalidate_pattern', pattern, error });
      
      return 0;
    }
  }

  /**
   * Invalidate cache for specific triggers
   */
  async invalidateByTrigger(trigger: InvalidationTrigger, context: Record<string, string> = {}): Promise<void> {
    const strategies = this.config.invalidationStrategies.filter(
      strategy => strategy.triggers.includes(trigger)
    );

    for (const strategy of strategies) {
      try {
        const pattern = this.buildInvalidationPattern(strategy.pattern, context);
        const deletedCount = await this.invalidatePattern(pattern);
        
        console.log(`Invalidated ${deletedCount} keys for strategy ${strategy.name} with trigger ${trigger}`);
        
      } catch (error) {
        console.error(`Error invalidating cache for strategy ${strategy.name}:`, error);
      }
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset cache metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.responseTimes = [];
    
    this.emit('cache:metrics_reset');
  }

  /**
   * Get cache info for debugging
   */
  async getCacheInfo(): Promise<any> {
    try {
      const info = await this.redisClient.info('memory');
      const keyCount = await this.redisClient.dbsize();
      
      return {
        memoryInfo: info,
        keyCount,
        metrics: this.metrics
      };
    } catch (error) {
      console.error('Error getting cache info:', error);
      return null;
    }
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUp(gameId: string, playerIds: string[]): Promise<void> {
    console.log(`Warming up cache for game ${gameId} with ${playerIds.length} players`);

    const warmUpPromises = playerIds.map(async (playerId) => {
      try {
        // Pre-cache common data patterns
        const cacheKeys: CacheKey[] = [
          { type: 'player_data', gameId, playerId },
          { type: 'game_assets', gameId, playerId },
          { type: 'achievements', gameId, playerId },
          { type: 'statistics', gameId, playerId }
        ];

        // Check if data is already cached
        for (const cacheKey of cacheKeys) {
          const cached = await this.get(cacheKey);
          if (!cached) {
            // Data not cached - would need to fetch from source
            // This is where you'd integrate with your data sources
            console.log(`Cache miss during warmup for ${this.buildCacheKey(cacheKey)}`);
          }
        }
      } catch (error) {
        console.error(`Error warming up cache for player ${playerId}:`, error);
      }
    });

    await Promise.allSettled(warmUpPromises);
    
    this.emit('cache:warmup_complete', { gameId, playerCount: playerIds.length });
  }

  /**
   * Clean up expired and least recently used entries
   */
  async cleanup(): Promise<void> {
    try {
      // Get all keys with our prefix
      const keys = await this.redisClient.keys(`${this.config.redis.keyPrefix}:*`);
      
      let cleanedCount = 0;
      
      for (const key of keys) {
        try {
          const ttl = await this.redisClient.ttl(key);
          
          // Remove expired keys (TTL = -2 means expired)
          if (ttl === -2) {
            await this.redisClient.del(key);
            cleanedCount++;
          }
        } catch (error) {
          console.error(`Error checking TTL for key ${key}:`, error);
        }
      }

      this.metrics.evictions += cleanedCount;
      
      console.log(`Cache cleanup completed: ${cleanedCount} keys removed`);
      
      this.emit('cache:cleanup_complete', { keysRemoved: cleanedCount });
      
    } catch (error) {
      console.error('Error during cache cleanup:', error);
    }
  }

  /**
   * Shutdown cache manager
   */
  async shutdown(): Promise<void> {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      
      console.log('Cache manager shutdown complete');
      
      this.emit('cache:shutdown');
    } catch (error) {
      console.error('Error during cache shutdown:', error);
    }
  }

  // Private methods

  private async initializeRedis(): Promise<void> {
    // Note: In a real implementation, you would use the actual Redis client
    // For now, we'll simulate the Redis setup
    
    this.redisClient = {
      get: async (key: string) => {
        // Simulate Redis get operation
        return null; // No cached data initially
      },
      setex: async (key: string, ttl: number, value: string) => {
        // Simulate Redis setex operation
        console.log(`Redis SETEX: ${key} (TTL: ${ttl}s)`);
      },
      del: async (...keys: string[]) => {
        // Simulate Redis delete operation
        console.log(`Redis DEL: ${keys.join(', ')}`);
        return keys.length;
      },
      keys: async (pattern: string) => {
        // Simulate Redis keys operation
        return [];
      },
      info: async (section: string) => {
        // Simulate Redis info operation
        return 'used_memory:1048576\nused_memory_human:1.00M';
      },
      dbsize: async () => {
        // Simulate Redis dbsize operation
        return 0;
      },
      ttl: async (key: string) => {
        // Simulate Redis TTL operation
        return -1; // Key exists but has no TTL
      },
      quit: async () => {
        console.log('Redis client disconnected');
      }
    };
  }

  private setupInvalidationStrategies(): void {
    // Set up default invalidation strategies if none provided
    if (this.config.invalidationStrategies.length === 0) {
      this.config.invalidationStrategies = [
        {
          name: 'player_data_invalidation',
          pattern: 'player_data:*:{playerId}',
          triggers: ['player_update', 'game_sync']
        },
        {
          name: 'asset_invalidation',
          pattern: 'game_assets:*:{playerId}',
          triggers: ['asset_transfer', 'player_update']
        },
        {
          name: 'achievement_invalidation',
          pattern: 'achievements:*:{playerId}',
          triggers: ['achievement_earned', 'player_update']
        },
        {
          name: 'aggregated_data_invalidation',
          pattern: 'aggregated_data:*:{playerId}',
          triggers: ['player_update', 'asset_transfer', 'achievement_earned']
        }
      ];
    }
  }

  private buildCacheKey(cacheKey: CacheKey): string {
    const parts = [this.config.redis.keyPrefix, cacheKey.type, cacheKey.gameId];
    
    if (cacheKey.playerId) parts.push(cacheKey.playerId);
    if (cacheKey.assetId) parts.push(cacheKey.assetId);
    if (cacheKey.achievementId) parts.push(cacheKey.achievementId);
    
    if (cacheKey.additionalParams) {
      const paramString = Object.entries(cacheKey.additionalParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      parts.push(paramString);
    }
    
    return parts.join(':');
  }

  private buildInvalidationPattern(pattern: string, context: Record<string, string>): string {
    let result = pattern;
    
    for (const [key, value] of Object.entries(context)) {
      result = result.replace(`{${key}}`, value);
    }
    
    // Replace any remaining placeholders with wildcards
    result = result.replace(/\{[^}]+\}/g, '*');
    
    return result;
  }

  private shouldCompress(value: any): boolean {
    if (!this.config.compressionEnabled) return false;
    
    const size = this.calculateSize(value);
    return size > 1024; // Compress if larger than 1KB
  }

  private compress(value: any): string {
    // Simple compression simulation - in real implementation use gzip or similar
    return JSON.stringify(value);
  }

  private decompress(value: string): any {
    // Simple decompression simulation
    return JSON.parse(value);
  }

  private calculateSize(value: any): number {
    return JSON.stringify(value).length;
  }

  private recordResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);
    
    if (this.responseTimes.length > this.maxResponseTimeSamples) {
      this.responseTimes = this.responseTimes.slice(-this.maxResponseTimeSamples);
    }
    
    this.metrics.averageResponseTime = 
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  private updateHitRate(): void {
    this.metrics.hitRate = this.metrics.totalRequests > 0 
      ? (this.metrics.hits / this.metrics.totalRequests) * 100 
      : 0;
  }

  private initializeMetrics(): CacheMetrics {
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      averageResponseTime: 0,
      memoryUsage: 0,
      keyCount: 0,
      evictions: 0,
      errors: 0,
      lastResetTime: Date.now()
    };
  }
}