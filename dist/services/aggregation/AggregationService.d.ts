import { EventEmitter } from 'events';
import { SyncEngineConfig } from './SyncEngine';
import { ValidationConfig } from './DataValidator';
import { CacheConfig } from './CacheManager';
import { PerformanceConfig } from './PerformanceMonitor';
import { GameAdapter } from './GameAdapter';
import { StandardizedGameData, PlayerGameData } from '../../types/core';
import { AggregationService as IAggregationService } from '../../types/services';
export interface AggregationServiceConfig {
    sync: SyncEngineConfig;
    validation: ValidationConfig;
    cache: CacheConfig;
    performance: PerformanceConfig;
    enableRealTimeSync: boolean;
    enableCaching: boolean;
    enablePerformanceMonitoring: boolean;
    enableDataValidation: boolean;
}
export interface AggregationStatus {
    isRunning: boolean;
    registeredGames: number;
    activeSyncs: number;
    cacheHitRate: number;
    averageResponseTime: number;
    errorRate: number;
    lastSyncTime: number;
}
export declare class AggregationService extends EventEmitter implements IAggregationService {
    private config;
    private adapterRegistry;
    private syncEngine;
    private dataValidator;
    private eventSystem;
    private cacheManager;
    private performanceMonitor;
    private isInitialized;
    private isRunning;
    constructor(config: AggregationServiceConfig);
    initialize(): Promise<void>;
    registerGame(adapter: GameAdapter): Promise<void>;
    syncPlayerData(playerId: string, gameId?: string): Promise<StandardizedGameData[]>;
    getPlayerGameData(playerId: string, gameId: string): Promise<PlayerGameData>;
    subscribeToPlayerUpdates(playerId: string, callback: (data: StandardizedGameData) => void): void;
    getStatus(): AggregationStatus;
    getPerformanceMetrics(): any;
    getCacheMetrics(): any;
    invalidatePlayerCache(playerId: string, gameId?: string): Promise<void>;
    shutdown(): Promise<void>;
    private fetchAndValidatePlayerData;
    private setupEventHandlers;
}
//# sourceMappingURL=AggregationService.d.ts.map