import { EventEmitter } from 'events';
import { AdapterRegistry } from './AdapterRegistry';
import { StandardizedGameData, PlayerGameData, GameHubError, Timestamp } from '../../types/core';
export interface SyncEngineConfig {
    redis: {
        host: string;
        port: number;
        password?: string;
        db: number;
    };
    sync: {
        batchSize: number;
        batchIntervalMs: number;
        maxRetries: number;
        validationEnabled: boolean;
    };
    websocket: {
        heartbeatIntervalMs: number;
        reconnectDelayMs: number;
        maxReconnectAttempts: number;
    };
}
export interface SyncEvent {
    type: 'player_update' | 'asset_transfer' | 'achievement_earned' | 'sync_error';
    gameId: string;
    playerId: string;
    data: any;
    timestamp: Timestamp;
}
export interface SyncStatus {
    gameId: string;
    isConnected: boolean;
    lastSyncTime: Timestamp;
    pendingUpdates: number;
    errorCount: number;
    lastError?: GameHubError;
}
export declare class SyncEngine extends EventEmitter {
    private config;
    private adapterRegistry;
    private redisClient;
    private redisPub;
    private redisSub;
    private syncStatuses;
    private updateQueue;
    private batchProcessor;
    private circuitBreaker;
    private isRunning;
    constructor(config: SyncEngineConfig, adapterRegistry: AdapterRegistry);
    initialize(): Promise<void>;
    startGameSync(gameId: string): Promise<void>;
    stopGameSync(gameId: string): Promise<void>;
    getSyncStatuses(): SyncStatus[];
    getSyncStatus(gameId: string): SyncStatus | null;
    syncPlayer(playerId: string): Promise<StandardizedGameData[]>;
    validatePlayerData(data: PlayerGameData): Promise<boolean>;
    shutdown(): Promise<void>;
    private initializeRedis;
    private setupRedisMessageHandling;
    private setupEventListeners;
    private startBatchProcessor;
    private processBatchUpdates;
    private processBatch;
    private processPendingUpdates;
    private publishUpdate;
    private handlePlayerUpdate;
    private handleSyncError;
    private emitSyncEvent;
    private chunkArray;
}
//# sourceMappingURL=SyncEngine.d.ts.map