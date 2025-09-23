import { EventEmitter } from 'events';
import { StandardizedGameData, Timestamp } from '../../types/core';
import { GameAdapter } from './GameAdapter';
export interface RealtimeSyncConfig {
    redis: {
        url: string;
        keyPrefix: string;
    };
    websocket: {
        port: number;
        heartbeatInterval: number;
        maxConnections: number;
    };
    validation: {
        enableIntegrityChecks: boolean;
        maxDataAge: number;
        requiredFields: string[];
    };
}
export interface GameDataUpdate {
    playerId: string;
    gameId: string;
    updateType: 'ASSET_CHANGE' | 'ACHIEVEMENT_EARNED' | 'STATS_UPDATE' | 'FULL_SYNC';
    data: StandardizedGameData;
    timestamp: Timestamp;
    source: 'WEBSOCKET' | 'POLLING' | 'MANUAL';
}
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
export declare class RealtimeSyncService extends EventEmitter {
    private config;
    private redisClient;
    private redisSubscriber;
    private wsServer;
    private gameAdapters;
    private activeConnections;
    private isRunning;
    constructor(config: RealtimeSyncConfig);
    initialize(): Promise<void>;
    registerGameAdapter(adapter: GameAdapter): Promise<void>;
    subscribeToPlayerUpdates(playerId: string, callback: (update: GameDataUpdate) => void): Promise<void>;
    unsubscribeFromPlayerUpdates(playerId: string): Promise<void>;
    publishGameDataUpdate(update: GameDataUpdate): Promise<void>;
    getCachedGameData(playerId: string, gameId: string): Promise<StandardizedGameData | null>;
    validateGameData(data: StandardizedGameData): Promise<ValidationResult>;
    shutdown(): Promise<void>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        details: Record<string, any>;
    }>;
    private setupErrorHandlers;
    private setupRedisPubSub;
    private setupWebSocketServer;
    private handleGameDataUpdate;
    private handleWebSocketMessage;
    private cacheGameData;
    private broadcastToWebSocketClients;
    private getPlayerChannel;
    private getGameDataKey;
    private generateConnectionId;
    private hasNestedProperty;
}
//# sourceMappingURL=RealtimeSyncService.d.ts.map