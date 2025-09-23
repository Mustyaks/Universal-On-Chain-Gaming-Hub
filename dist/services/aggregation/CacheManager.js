"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const events_1 = require("events");
class CacheManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.responseTimes = [];
        this.maxResponseTimeSamples = 1000;
        this.config = config;
        this.metrics = this.initializeMetrics();
    }
    async initialize() {
        try {
            await this.initializeRedis();
            await this.setupInvalidationStrategies();
            console.log('Cache manager initialized successfully');
            this.emit('cache:initialized');
        }
        catch (error) {
            console.error('Failed to initialize cache manager:', error);
            throw error;
        }
    }
    async get(cacheKey) {
        const startTime = Date.now();
        const key = this.buildCacheKey(cacheKey);
        try {
            this.metrics.totalRequests++;
            const cachedData = await this.redisClient.get(key);
            if (cachedData) {
                this.metrics.hits++;
                const entry = JSON.parse(cachedData);
                entry.lastAccessed = Date.now();
                entry.accessCount++;
                await this.redisClient.setex(key, entry.ttl, JSON.stringify(entry));
                const responseTime = Date.now() - startTime;
                this.recordResponseTime(responseTime);
                this.emit('cache:hit', { key, responseTime });
                return entry.compressed ? this.decompress(entry.value) : entry.value;
            }
            else {
                this.metrics.misses++;
                const responseTime = Date.now() - startTime;
                this.recordResponseTime(responseTime);
                this.emit('cache:miss', { key, responseTime });
                return null;
            }
        }
        catch (error) {
            this.metrics.errors++;
            console.error(`Cache get error for key ${key}:`, error);
            this.emit('cache:error', { operation: 'get', key, error });
            return null;
        }
        finally {
            this.updateHitRate();
        }
    }
    async set(cacheKey, value, ttl) {
        const key = this.buildCacheKey(cacheKey);
        const effectiveTtl = ttl || this.config.defaultTtl;
        try {
            const shouldCompress = this.shouldCompress(value);
            const processedValue = shouldCompress ? this.compress(value) : value;
            const entry = {
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
        }
        catch (error) {
            this.metrics.errors++;
            console.error(`Cache set error for key ${key}:`, error);
            this.emit('cache:error', { operation: 'set', key, error });
            throw error;
        }
    }
    async delete(cacheKey) {
        const key = this.buildCacheKey(cacheKey);
        try {
            const result = await this.redisClient.del(key);
            this.emit('cache:delete', { key });
            return result > 0;
        }
        catch (error) {
            this.metrics.errors++;
            console.error(`Cache delete error for key ${key}:`, error);
            this.emit('cache:error', { operation: 'delete', key, error });
            return false;
        }
    }
    async invalidatePattern(pattern) {
        try {
            const keys = await this.redisClient.keys(`${this.config.redis.keyPrefix}:${pattern}`);
            if (keys.length === 0) {
                return 0;
            }
            const result = await this.redisClient.del(...keys);
            this.emit('cache:invalidate_pattern', { pattern, keysDeleted: result });
            return result;
        }
        catch (error) {
            this.metrics.errors++;
            console.error(`Cache pattern invalidation error for pattern ${pattern}:`, error);
            this.emit('cache:error', { operation: 'invalidate_pattern', pattern, error });
            return 0;
        }
    }
    async invalidateByTrigger(trigger, context = {}) {
        const strategies = this.config.invalidationStrategies.filter(strategy => strategy.triggers.includes(trigger));
        for (const strategy of strategies) {
            try {
                const pattern = this.buildInvalidationPattern(strategy.pattern, context);
                const deletedCount = await this.invalidatePattern(pattern);
                console.log(`Invalidated ${deletedCount} keys for strategy ${strategy.name} with trigger ${trigger}`);
            }
            catch (error) {
                console.error(`Error invalidating cache for strategy ${strategy.name}:`, error);
            }
        }
    }
    getMetrics() {
        return { ...this.metrics };
    }
    resetMetrics() {
        this.metrics = this.initializeMetrics();
        this.responseTimes = [];
        this.emit('cache:metrics_reset');
    }
    async getCacheInfo() {
        try {
            const info = await this.redisClient.info('memory');
            const keyCount = await this.redisClient.dbsize();
            return {
                memoryInfo: info,
                keyCount,
                metrics: this.metrics
            };
        }
        catch (error) {
            console.error('Error getting cache info:', error);
            return null;
        }
    }
    async warmUp(gameId, playerIds) {
        console.log(`Warming up cache for game ${gameId} with ${playerIds.length} players`);
        const warmUpPromises = playerIds.map(async (playerId) => {
            try {
                const cacheKeys = [
                    { type: 'player_data', gameId, playerId },
                    { type: 'game_assets', gameId, playerId },
                    { type: 'achievements', gameId, playerId },
                    { type: 'statistics', gameId, playerId }
                ];
                for (const cacheKey of cacheKeys) {
                    const cached = await this.get(cacheKey);
                    if (!cached) {
                        console.log(`Cache miss during warmup for ${this.buildCacheKey(cacheKey)}`);
                    }
                }
            }
            catch (error) {
                console.error(`Error warming up cache for player ${playerId}:`, error);
            }
        });
        await Promise.allSettled(warmUpPromises);
        this.emit('cache:warmup_complete', { gameId, playerCount: playerIds.length });
    }
    async cleanup() {
        try {
            const keys = await this.redisClient.keys(`${this.config.redis.keyPrefix}:*`);
            let cleanedCount = 0;
            for (const key of keys) {
                try {
                    const ttl = await this.redisClient.ttl(key);
                    if (ttl === -2) {
                        await this.redisClient.del(key);
                        cleanedCount++;
                    }
                }
                catch (error) {
                    console.error(`Error checking TTL for key ${key}:`, error);
                }
            }
            this.metrics.evictions += cleanedCount;
            console.log(`Cache cleanup completed: ${cleanedCount} keys removed`);
            this.emit('cache:cleanup_complete', { keysRemoved: cleanedCount });
        }
        catch (error) {
            console.error('Error during cache cleanup:', error);
        }
    }
    async shutdown() {
        try {
            if (this.redisClient) {
                await this.redisClient.quit();
            }
            console.log('Cache manager shutdown complete');
            this.emit('cache:shutdown');
        }
        catch (error) {
            console.error('Error during cache shutdown:', error);
        }
    }
    async initializeRedis() {
        this.redisClient = {
            get: async (key) => {
                return null;
            },
            setex: async (key, ttl, value) => {
                console.log(`Redis SETEX: ${key} (TTL: ${ttl}s)`);
            },
            del: async (...keys) => {
                console.log(`Redis DEL: ${keys.join(', ')}`);
                return keys.length;
            },
            keys: async (pattern) => {
                return [];
            },
            info: async (section) => {
                return 'used_memory:1048576\nused_memory_human:1.00M';
            },
            dbsize: async () => {
                return 0;
            },
            ttl: async (key) => {
                return -1;
            },
            quit: async () => {
                console.log('Redis client disconnected');
            }
        };
    }
    setupInvalidationStrategies() {
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
    buildCacheKey(cacheKey) {
        const parts = [this.config.redis.keyPrefix, cacheKey.type, cacheKey.gameId];
        if (cacheKey.playerId)
            parts.push(cacheKey.playerId);
        if (cacheKey.assetId)
            parts.push(cacheKey.assetId);
        if (cacheKey.achievementId)
            parts.push(cacheKey.achievementId);
        if (cacheKey.additionalParams) {
            const paramString = Object.entries(cacheKey.additionalParams)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => `${key}=${value}`)
                .join('&');
            parts.push(paramString);
        }
        return parts.join(':');
    }
    buildInvalidationPattern(pattern, context) {
        let result = pattern;
        for (const [key, value] of Object.entries(context)) {
            result = result.replace(`{${key}}`, value);
        }
        result = result.replace(/\{[^}]+\}/g, '*');
        return result;
    }
    shouldCompress(value) {
        if (!this.config.compressionEnabled)
            return false;
        const size = this.calculateSize(value);
        return size > 1024;
    }
    compress(value) {
        return JSON.stringify(value);
    }
    decompress(value) {
        return JSON.parse(value);
    }
    calculateSize(value) {
        return JSON.stringify(value).length;
    }
    recordResponseTime(responseTime) {
        this.responseTimes.push(responseTime);
        if (this.responseTimes.length > this.maxResponseTimeSamples) {
            this.responseTimes = this.responseTimes.slice(-this.maxResponseTimeSamples);
        }
        this.metrics.averageResponseTime =
            this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    }
    updateHitRate() {
        this.metrics.hitRate = this.metrics.totalRequests > 0
            ? (this.metrics.hits / this.metrics.totalRequests) * 100
            : 0;
    }
    initializeMetrics() {
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
exports.CacheManager = CacheManager;
//# sourceMappingURL=CacheManager.js.map