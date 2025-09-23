import { GameAsset, Achievement, GameStatistics, StandardizedGameData, PlayerGameData, GameHubError, Timestamp } from '../../types/core';
import { WebSocketGameClient } from './WebSocketGameClient';
import { EventEmitter } from 'events';
export interface GameAdapter {
    readonly gameId: string;
    readonly gameName: string;
    readonly version: string;
    readonly supportedFeatures: GameFeature[];
    normalize(rawData: any): Promise<StandardizedGameData>;
    fetchPlayerData(playerId: string): Promise<PlayerGameData>;
    subscribeToUpdates(callback: (data: PlayerGameData) => void): Promise<void>;
    unsubscribeFromUpdates(): Promise<void>;
    validateAsset(asset: GameAsset): Promise<boolean>;
    isHealthy(): Promise<boolean>;
    getLastSyncTime(): Timestamp;
    handleError(error: any): GameHubError;
}
export type GameFeature = 'ASSETS' | 'ACHIEVEMENTS' | 'STATISTICS' | 'REAL_TIME_UPDATES' | 'ASSET_TRADING';
export interface GameAdapterConfig {
    gameId: string;
    gameName: string;
    contractAddress: string;
    rpcEndpoint: string;
    wsEndpoint?: string;
    retryConfig: RetryConfig;
    cacheConfig: CacheConfig;
}
export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}
export interface CacheConfig {
    ttlSeconds: number;
    maxEntries: number;
    enableCache: boolean;
}
export declare abstract class BaseGameAdapter extends EventEmitter implements GameAdapter {
    protected config: GameAdapterConfig;
    protected lastSyncTime: Timestamp;
    protected isConnected: boolean;
    protected updateCallback?: (data: PlayerGameData) => void | undefined;
    protected wsClient?: WebSocketGameClient;
    constructor(config: GameAdapterConfig);
    get gameId(): string;
    get gameName(): string;
    get version(): string;
    get supportedFeatures(): GameFeature[];
    abstract normalize(rawData: any): Promise<StandardizedGameData>;
    abstract fetchRawPlayerData(playerId: string): Promise<any>;
    abstract validateAsset(asset: GameAsset): Promise<boolean>;
    abstract connectToGameNetwork(): Promise<void>;
    abstract disconnectFromGameNetwork(): Promise<void>;
    fetchPlayerData(playerId: string): Promise<PlayerGameData>;
    subscribeToUpdates(callback: (data: PlayerGameData) => void): Promise<void>;
    unsubscribeFromUpdates(): Promise<void>;
    isHealthy(): Promise<boolean>;
    getLastSyncTime(): Timestamp;
    handleError(error: any): GameHubError;
    protected executeWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T>;
    protected sleep(ms: number): Promise<void>;
    protected performHealthCheck(): Promise<void>;
    protected normalizeAssets(rawAssets: any[]): GameAsset[];
    protected normalizeAsset(rawAsset: any): GameAsset;
    protected normalizeAchievements(rawAchievements: any[]): Achievement[];
    protected normalizeStatistics(rawStats: any): GameStatistics;
    private determineAssetType;
    private determineRarity;
    protected initializeWebSocketClient(): void;
    protected setupWebSocketEventHandlers(): void;
    protected processWebSocketUpdate(data: any): Promise<PlayerGameData | null>;
    protected processAssetChange(data: any): Promise<PlayerGameData | null>;
    protected processAchievementEarned(data: any): Promise<PlayerGameData | null>;
    subscribeToPlayerUpdates(playerId: string): Promise<void>;
    unsubscribeFromPlayerUpdates(playerId: string): Promise<void>;
    getWebSocketStatus(): {
        connected: boolean;
        subscribedPlayers: number;
    } | null;
}
//# sourceMappingURL=GameAdapter.d.ts.map