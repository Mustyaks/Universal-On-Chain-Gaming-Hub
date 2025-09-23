import { EventEmitter } from 'events';
import { StandardizedGameData, Timestamp } from '../../types/core';
import { GameAdapter } from './GameAdapter';
import { RealtimeSyncConfig, GameDataUpdate } from './RealtimeSyncService';
import { RedisEventConfig } from './RedisEventManager';
import { ValidationConfig } from './DataValidationService';
export interface RealtimeAggregationConfig {
    sync: RealtimeSyncConfig;
    redis: RedisEventConfig;
    validation: ValidationConfig;
    aggregation: {
        batchSize: number;
        flushInterval: number;
        enableMetrics: boolean;
    };
}
export interface AggregationMetrics {
    totalUpdates: number;
    validUpdates: number;
    invalidUpdates: number;
    averageValidationTime: number;
    averageProcessingTime: number;
    activeSubscriptions: number;
    cacheHitRate: number;
}
export interface PlayerSubscription {
    playerId: string;
    gameIds: Set<string>;
    callback: (update: GameDataUpdate) => void;
    subscribedAt: Timestamp;
}
export declare class RealtimeAggregationService extends EventEmitter {
    private config;
    private syncService;
    private redisManager;
    private validationService;
    private gameAdapters;
    private playerSubscriptions;
    private updateQueue;
    private metrics;
    private flushTimer;
    private isRunning;
    constructor(config: RealtimeAggregationConfig);
    initialize(): Promise<void>;
    registerGameAdapter(adapter: GameAdapter): Promise<void>;
    subscribeToPlayer(playerId: string, callback: (update: GameDataUpdate) => void, gameIds?: string[]): Promise<void>;
    unsubscribeFromPlayer(playerId: string): Promise<void>;
    processGameDataUpdate(playerId: string, gameId: string, data: StandardizedGameData, source?: 'WEBSOCKET' | 'POLLING' | 'MANUAL'): Promise<void>;
    getCachedGameData(playerId: string, gameId: string): Promise<StandardizedGameData | null>;
    getMetrics(): AggregationMetrics;
    getHealthStatus(): Promise<{
        healthy: boolean;
        services: Record<string, boolean>;
        metrics: AggregationMetrics;
    }>;
    shutdown(): Promise<void>;
    private setupEventHandlers;
    private setupAdapterEventHandlers;
    private startUpdateProcessing;
    private flushUpdateQueue;
    private publishUpdate;
    private validateGameData;
    private determineUpdateType;
    private updateAverageMetric;
    private updateCacheHitRate;
}
//# sourceMappingURL=RealtimeAggregationService.d.ts.map