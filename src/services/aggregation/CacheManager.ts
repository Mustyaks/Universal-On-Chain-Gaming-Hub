/**
 * Caching layer for performance optimization
 * Implements Redis caching, cache invalidation strategies, and performance monitoring
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
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
  private redisClient: RedisClientType;
  private metrics: CacheMetrics;
  private responseTimes: number[] = [];
  private maxResponseTimeSamples = 1000;
  private metricsInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

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
      this.startPerformanceMonitoring();
      this.startCleanupScheduler();
      
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

    const invalidationPromises = strategies.map(async (strategy) => {
      try {
        const pattern = this.buildInvalidationPattern(strategy.pattern, context);
        const deletedCount = await this.invalidatePattern(pattern);
        
        console.log(`Invalidated ${deletedCount} keys for strategy ${strategy.name} with trigger ${trigger}`);
        
        return { strategy: strategy.name, deletedCount };
      } catch (error) {
        console.error(`Error invalidating cache for strategy ${strategy.name}:`, error);
        return { strategy: strategy.name, deletedCount: 0, error };
      }
    });

    const results = await Promise.allSettled(invalidationPromises);
    
    this.emit('cache:bulk_invalidation', { 
      trigger, 
      context, 
      results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason })
    });
  }

  /**
   * Smart cache invalidation based on data relationships
   */
  async smartInvalidate(dataType: string, entityId: string, gameId?: string): Promise<void> {
    const invalidationMap: Record<string, string[]> = {
      'player_update': [
        'player_data:*:{playerId}',
        'aggregated_data:*:{playerId}',
        'statistics:*:{playerId}'
      ],
      'asset_transfer': [
        'game_assets:*:{playerId}',
        'game_assets:*:{newOwnerId}',
        'aggregated_data:*:{playerId}',
        'aggregated_data:*:{newOwnerId}'
      ],
      'achievement_earned': [
        'achievements:*:{playerId}',
        'aggregated_data:*:{playerId}',
        'statistics:*:{playerId}'
      ],
      'game_sync': [
        'player_data:{gameId}:*',
        'game_assets:{gameId}:*',
        'achievements:{gameId}:*',
        'validation_result:{gameId}:*'
      ]
    };

    const patterns = invalidationMap[dataType] || [];
    const context = { playerId: entityId, gameId: gameId || '*' };

    for (const pattern of patterns) {
      try {
        const resolvedPattern = this.buildInvalidationPattern(pattern, context);
        await this.invalidatePattern(resolvedPattern);
      } catch (error) {
        console.error(`Error in smart invalidation for pattern ${pattern}:`, error);
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
   * Get detailed performance metrics
   */
  async getDetailedMetrics(): Promise<DetailedCacheMetrics> {
    try {
      const info = await this.redisClient.info('memory');
      const keyCount = await this.redisClient.dbSize();
      
      // Parse Redis memory info
      const memoryStats = this.parseRedisMemoryInfo(info);
      
      // Calculate percentiles for response times
      const responseTimePercentiles = this.calculatePercentiles(this.responseTimes);
      
      return {
        ...this.metrics,
        keyCount,
        memoryStats,
        responseTimePercentiles,
        cacheEfficiency: this.calculateCacheEfficiency(),
        topKeys: await this.getTopAccessedKeys(),
        errorRate: this.metrics.totalRequests > 0 ? (this.metrics.errors / this.metrics.totalRequests) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting detailed metrics:', error);
      return {
        ...this.metrics,
        keyCount: 0,
        memoryStats: {},
        responseTimePercentiles: {},
        cacheEfficiency: 0,
        topKeys: [],
        errorRate: 0
      };
    }
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
   * Get cache health status
   */
  async getHealthStatus(): Promise<CacheHealthStatus> {
    try {
      const startTime = Date.now();
      await this.redisClient.ping();
      const pingTime = Date.now() - startTime;
      
      const metrics = await this.getDetailedMetrics();
      
      let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
      const issues: string[] = [];
      
      // Check various health indicators
      if (pingTime > 100) {
        status = 'DEGRADED';
        issues.push(`High Redis latency: ${pingTime}ms`);
      }
      
      if (metrics.hitRate < 50) {
        status = 'DEGRADED';
        issues.push(`Low cache hit rate: ${metrics.hitRate.toFixed(1)}%`);
      }
      
      if (metrics.errorRate > 5) {
        status = 'UNHEALTHY';
        issues.push(`High error rate: ${metrics.errorRate.toFixed(1)}%`);
      }
      
      if (this.config.maxMemoryUsage > 0 && metrics.memoryUsage > this.config.maxMemoryUsage * 0.9) {
        status = 'DEGRADED';
        issues.push(`Memory usage near limit: ${(metrics.memoryUsage / this.config.maxMemoryUsage * 100).toFixed(1)}%`);
      }
      
      return {
        status,
        pingTime,
        issues,
        metrics,
        timestamp: Date.now()
      };
      
    } catch (error) {
      return {
        status: 'UNHEALTHY',
        pingTime: -1,
        issues: [`Redis connection error: ${error.message}`],
        metrics: this.metrics,
        timestamp: Date.now()
      };
    }
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
      // Clear intervals
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Disconnect Redis
      if (this.redisClient && this.redisClient.isOpen) {
        await this.redisClient.quit();
      }
      
      console.log('Cache manager shutdown complete');
      
      this.emit('cache:shutdown');
    } catch (error) {
      console.error('Error during cache shutdown:', error);
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    if (!this.config.metricsEnabled) return;

    // Update metrics every 30 seconds
    this.metricsInterval = setInterval(async () => {
      try {
        await this.updateMemoryMetrics();
        this.emit('cache:metrics_updated', this.metrics);
      } catch (error) {
        console.error('Error updating cache metrics:', error);
      }
    }, 30000);
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        console.error('Error during scheduled cleanup:', error);
      }
    }, 300000);
  }

  /**
   * Update memory usage metrics from Redis
   */
  private async updateMemoryMetrics(): Promise<void> {
    try {
      const info = await this.redisClient.info('memory');
      const keyCount = await this.redisClient.dbSize();
      
      // Parse memory info
      const memoryMatch = info.match(/used_memory:(\d+)/);
      if (memoryMatch) {
        this.metrics.memoryUsage = parseInt(memoryMatch[1], 10);
      }
      
      this.metrics.keyCount = keyCount;
      
      // Check memory usage against limit
      if (this.config.maxMemoryUsage > 0 && this.metrics.memoryUsage > this.config.maxMemoryUsage) {
        console.warn(`Cache memory usage (${this.metrics.memoryUsage}) exceeds limit (${this.config.maxMemoryUsage})`);
        this.emit('cache:memory_warning', { 
          usage: this.metrics.memoryUsage, 
          limit: this.config.maxMemoryUsage 
        });
        
        // Trigger aggressive cleanup
        await this.aggressiveCleanup();
      }
      
    } catch (error) {
      console.error('Error updating memory metrics:', error);
    }
  }

  /**
   * Aggressive cleanup when memory limit is exceeded
   */
  private async aggressiveCleanup(): Promise<void> {
    try {
      console.log('Starting aggressive cache cleanup due to memory pressure');
      
      // Get all keys with our prefix
      const keys = await this.redisClient.keys(`${this.config.redis.keyPrefix}:*`);
      
      // Get TTL and access info for all keys
      const keyInfoPromises = keys.map(async (key) => {
        try {
          const ttl = await this.redisClient.ttl(key);
          const data = await this.redisClient.get(key);
          
          if (data) {
            const entry: CacheEntry = JSON.parse(data);
            return {
              key,
              ttl,
              lastAccessed: entry.lastAccessed,
              accessCount: entry.accessCount,
              size: entry.size
            };
          }
        } catch (error) {
          return null;
        }
      });

      const keyInfos = (await Promise.all(keyInfoPromises)).filter(Boolean);
      
      // Sort by least recently used and lowest access count
      keyInfos.sort((a, b) => {
        if (a.accessCount !== b.accessCount) {
          return a.accessCount - b.accessCount;
        }
        return a.lastAccessed - b.lastAccessed;
      });

      // Remove 25% of least used keys
      const keysToRemove = keyInfos.slice(0, Math.floor(keyInfos.length * 0.25));
      
      if (keysToRemove.length > 0) {
        const keysToDelete = keysToRemove.map(info => info.key);
        const deletedCount = await this.redisClient.del(keysToDelete);
        
        this.metrics.evictions += deletedCount;
        
        console.log(`Aggressive cleanup completed: ${deletedCount} keys removed`);
        this.emit('cache:aggressive_cleanup', { keysRemoved: deletedCount });
      }
      
    } catch (error) {
      console.error('Error during aggressive cleanup:', error);
    }
  }

  // Private methods

  private async initializeRedis(): Promise<void> {
    try {
      // Create Redis client with configuration
      this.redisClient = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
        },
        password: this.config.redis.password,
        database: this.config.redis.db,
        name: 'universal-gaming-hub-cache'
      });

      // Set up error handling
      this.redisClient.on('error', (error) => {
        console.error('Redis client error:', error);
        this.metrics.errors++;
        this.emit('cache:redis_error', { error });
      });

      this.redisClient.on('connect', () => {
        console.log('Redis client connected');
        this.emit('cache:redis_connected');
      });

      this.redisClient.on('disconnect', () => {
        console.log('Redis client disconnected');
        this.emit('cache:redis_disconnected');
      });

      // Connect to Redis
      await this.redisClient.connect();
      
      // Test connection
      await this.redisClient.ping();
      
      console.log(`Redis connected to ${this.config.redis.host}:${this.config.redis.port}`);
      
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      throw new Error(`Redis initialization failed: ${error.message}`);
    }
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

  private parseRedisMemoryInfo(info: string): Record<string, any> {
    const stats: Record<string, any> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = isNaN(Number(value)) ? value : Number(value);
        }
      }
    }
    
    return stats;
  }

  private calculatePercentiles(values: number[]): Record<string, number> {
    if (values.length === 0) return {};
    
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      p50: this.getPercentile(sorted, 50),
      p90: this.getPercentile(sorted, 90),
      p95: this.getPercentile(sorted, 95),
      p99: this.getPercentile(sorted, 99)
    };
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }

  private calculateCacheEfficiency(): number {
    if (this.metrics.totalRequests === 0) return 0;
    
    // Efficiency considers hit rate and average response time
    const hitRateScore = this.metrics.hitRate / 100;
    const responseTimeScore = Math.max(0, 1 - (this.metrics.averageResponseTime / 1000)); // Normalize to 1 second
    
    return (hitRateScore * 0.7 + responseTimeScore * 0.3) * 100;
  }

  private async getTopAccessedKeys(limit: number = 10): Promise<Array<{key: string, accessCount: number}>> {
    try {
      const keys = await this.redisClient.keys(`${this.config.redis.keyPrefix}:*`);
      const keyStats: Array<{key: string, accessCount: number}> = [];
      
      for (const key of keys.slice(0, 100)) { // Limit to first 100 keys for performance
        try {
          const data = await this.redisClient.get(key);
          if (data) {
            const entry: CacheEntry = JSON.parse(data);
            keyStats.push({ key, accessCount: entry.accessCount });
          }
        } catch (error) {
          // Skip invalid entries
        }
      }
      
      return keyStats
        .sort((a, b) => b.accessCount - a.accessCount)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error getting top accessed keys:', error);
      return [];
    }
  }
}

// Additional interfaces for enhanced metrics
export interface DetailedCacheMetrics extends CacheMetrics {
  memoryStats: Record<string, any>;
  responseTimePercentiles: Record<string, number>;
  cacheEfficiency: number;
  topKeys: Array<{key: string, accessCount: number}>;
  errorRate: number;
}

export interface CacheHealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  pingTime: number;
  issues: string[];
  metrics: CacheMetrics;
  timestamp: Timestamp;
}