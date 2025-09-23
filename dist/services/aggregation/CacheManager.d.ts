import { EventEmitter } from 'events';
import { Timestamp } from '../../types/core';
export interface CacheConfig {
    redis: {
        host: string;
        port: number;
        password?: string;
        db: number;
        keyPrefix: string;
    };
    defaultTtl: number;
    maxMemoryUsage: number;
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
export type CacheKeyType = 'player_data' | 'game_assets' | 'achievements' | 'statistics' | 'aggregated_data' | 'validation_result' | 'adapter_health';
export interface InvalidationStrategy {
    name: string;
    pattern: string;
    triggers: InvalidationTrigger[];
    ttlOverride?: number;
}
export type InvalidationTrigger = 'player_update' | 'asset_transfer' | 'achievement_earned' | 'game_sync' | 'manual' | 'time_based';
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
export declare class CacheManager extends EventEmitter {
    private config;
    private redisClient;
    private metrics;
    private responseTimes;
    private maxResponseTimeSamples;
    constructor(config: CacheConfig);
    initialize(): Promise<void>;
    get<T>(cacheKey: CacheKey): Promise<T | null>;
    set<T>(cacheKey: CacheKey, value: T, ttl?: number): Promise<void>;
    delete(cacheKey: CacheKey): Promise<boolean>;
    invalidatePattern(pattern: string): Promise<number>;
    invalidateByTrigger(trigger: InvalidationTrigger, context?: Record<string, string>): Promise<void>;
    getMetrics(): CacheMetrics;
    resetMetrics(): void;
    getCacheInfo(): Promise<any>;
    warmUp(gameId: string, playerIds: string[]): Promise<void>;
    cleanup(): Promise<void>;
    shutdown(): Promise<void>;
    private initializeRedis;
    private setupInvalidationStrategies;
    private buildCacheKey;
    private buildInvalidationPattern;
    private shouldCompress;
    private compress;
    private decompress;
    private calculateSize;
    private recordResponseTime;
    private updateHitRate;
    private initializeMetrics;
}
//# sourceMappingURL=CacheManager.d.ts.map