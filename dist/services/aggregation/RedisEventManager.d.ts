import { EventEmitter } from 'events';
import { StandardizedGameData, Timestamp } from '../../types/core';
export interface RedisEventConfig {
    url: string;
    keyPrefix: string;
    defaultTTL: number;
    maxRetries: number;
    retryDelay: number;
}
export interface CacheEntry<T> {
    data: T;
    timestamp: Timestamp;
    ttl: number;
}
export interface EventSubscription {
    channel: string;
    pattern?: string;
    callback: (data: any) => void;
}
export declare class RedisEventManager extends EventEmitter {
    private config;
    private publisher;
    private subscriber;
    private cache;
    private subscriptions;
    private isConnected;
    constructor(config: RedisEventConfig);
    initialize(): Promise<void>;
    publishEvent(channel: string, data: any): Promise<void>;
    subscribeToChannel(channel: string, callback: (data: any) => void): Promise<void>;
    subscribeToPattern(pattern: string, callback: (channel: string, data: any) => void): Promise<void>;
    unsubscribeFromChannel(channel: string): Promise<void>;
    cacheGameData(playerId: string, gameId: string, data: StandardizedGameData, ttl?: number): Promise<void>;
    getCachedGameData(playerId: string, gameId: string): Promise<StandardizedGameData | null>;
    invalidatePlayerCache(playerId: string, gameId?: string): Promise<void>;
    publishPlayerUpdate(playerId: string, gameId: string, data: StandardizedGameData, updateType?: 'ASSET_CHANGE' | 'ACHIEVEMENT_EARNED' | 'STATS_UPDATE' | 'FULL_SYNC'): Promise<void>;
    getCacheStats(): Promise<{
        totalKeys: number;
        memoryUsage: string;
        hitRate: number;
    }>;
    shutdown(): Promise<void>;
    isHealthy(): Promise<boolean>;
    private setupErrorHandlers;
    private getChannelKey;
    private removeChannelPrefix;
    private getGameDataKey;
}
//# sourceMappingURL=RedisEventManager.d.ts.map