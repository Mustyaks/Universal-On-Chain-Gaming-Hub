/**
 * Base GameAdapter interface and abstract class for Dojo game integration
 * Implements standardized data normalization methods and plugin system
 */

import {
    GameAsset,
    Achievement,
    GameStatistics,
    StandardizedGameData,
    PlayerGameData,
    GameHubError,
    Timestamp
} from '../../types/core';

// Enhanced GameAdapter interface with error handling and retry mechanisms
export interface GameAdapter {
    readonly gameId: string;
    readonly gameName: string;
    readonly version: string;
    readonly supportedFeatures: GameFeature[];

    // Core normalization methods
    normalize(rawData: any): Promise<StandardizedGameData>;
    fetchPlayerData(playerId: string): Promise<PlayerGameData>;

    // Real-time updates
    subscribeToUpdates(callback: (data: PlayerGameData) => void): Promise<void>;
    unsubscribeFromUpdates(): Promise<void>;

    // Asset validation
    validateAsset(asset: GameAsset): Promise<boolean>;

    // Health and connectivity
    isHealthy(): Promise<boolean>;
    getLastSyncTime(): Timestamp;

    // Error handling
    handleError(error: any): GameHubError;
}

export type GameFeature =
    | 'ASSETS'
    | 'ACHIEVEMENTS'
    | 'STATISTICS'
    | 'REAL_TIME_UPDATES'
    | 'ASSET_TRADING';

// Configuration interface for game adapters
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

// Abstract base class implementing common functionality
export abstract class BaseGameAdapter implements GameAdapter {
    protected config: GameAdapterConfig;
    protected lastSyncTime: Timestamp = 0;
    protected isConnected: boolean = false;
    protected updateCallback?: (data: PlayerGameData) => void;

    constructor(config: GameAdapterConfig) {
        this.config = config;
    }

    get gameId(): string {
        return this.config.gameId;
    }

    get gameName(): string {
        return this.config.gameName;
    }

    get version(): string {
        return '1.0.0'; // Override in subclasses
    }

    get supportedFeatures(): GameFeature[] {
        return ['ASSETS', 'ACHIEVEMENTS', 'STATISTICS']; // Override in subclasses
    }

    // Abstract methods that must be implemented by concrete adapters
    abstract normalize(rawData: any): Promise<StandardizedGameData>;
    abstract fetchRawPlayerData(playerId: string): Promise<any>;
    abstract validateAsset(asset: GameAsset): Promise<boolean>;
    abstract connectToGameNetwork(): Promise<void>;
    abstract disconnectFromGameNetwork(): Promise<void>;

    // Implemented methods with retry logic and error handling
    async fetchPlayerData(playerId: string): Promise<PlayerGameData> {
        const rawData = await this.executeWithRetry(
            () => this.fetchRawPlayerData(playerId),
            `fetchPlayerData-${playerId}`
        );

        const normalizedData = await this.normalize(rawData);

        this.lastSyncTime = Date.now();

        return {
            playerId,
            gameId: this.gameId,
            rawData,
            normalizedData,
            syncedAt: this.lastSyncTime
        };
    }

    async subscribeToUpdates(callback: (data: PlayerGameData) => void): Promise<void> {
        this.updateCallback = callback;

        if (this.supportedFeatures.includes('REAL_TIME_UPDATES')) {
            await this.connectToGameNetwork();
            this.isConnected = true;
        }
    }

    async unsubscribeFromUpdates(): Promise<void> {
        this.updateCallback = undefined;

        if (this.isConnected) {
            await this.disconnectFromGameNetwork();
            this.isConnected = false;
        }
    }

    async isHealthy(): Promise<boolean> {
        try {
            // Basic health check - try to fetch a small piece of data
            await this.executeWithRetry(
                () => this.performHealthCheck(),
                'health-check'
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    getLastSyncTime(): Timestamp {
        return this.lastSyncTime;
    }

    handleError(error: any): GameHubError {
        const timestamp = Date.now();

        if (error.code === 'NETWORK_ERROR') {
            return {
                code: 'NETWORK_ERROR',
                message: `Network error connecting to ${this.gameName}: ${error.message}`,
                details: { gameId: this.gameId, originalError: error },
                timestamp
            };
        }

        if (error.code === 'DATA_INTEGRITY_ERROR') {
            return {
                code: 'DATA_INTEGRITY_ERROR',
                message: `Data integrity error in ${this.gameName}: ${error.message}`,
                details: { gameId: this.gameId, originalError: error },
                timestamp
            };
        }

        return {
            code: 'EXTERNAL_SERVICE_ERROR',
            message: `Unknown error in ${this.gameName}: ${error.message}`,
            details: { gameId: this.gameId, originalError: error },
            timestamp
        };
    }

    // Protected utility methods
    protected async executeWithRetry<T>(
        operation: () => Promise<T>,
        operationName: string
    ): Promise<T> {
        const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier } = this.config.retryConfig;

        let lastError: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                if (attempt === maxRetries) {
                    throw this.handleError(error);
                }

                const delay = Math.min(
                    baseDelayMs * Math.pow(backoffMultiplier, attempt),
                    maxDelayMs
                );

                console.warn(
                    `${this.gameName} adapter: ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`,
                    error
                );

                await this.sleep(delay);
            }
        }

        throw this.handleError(lastError);
    }

    protected async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    protected async performHealthCheck(): Promise<void> {
        // Override in subclasses for game-specific health checks
        // Default implementation just checks if we can connect
        if (this.config.rpcEndpoint) {
            // Simple connectivity test
            const response = await fetch(this.config.rpcEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: 'eth_blockNumber', params: [], id: 1 })
            });

            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }
        }
    }

    protected normalizeAssets(rawAssets: any[]): GameAsset[] {
        return rawAssets.map(asset => this.normalizeAsset(asset));
    }

    protected normalizeAsset(rawAsset: any): GameAsset {
        return {
            id: rawAsset.id || rawAsset.token_id,
            gameId: this.gameId,
            tokenId: rawAsset.token_id,
            contractAddress: rawAsset.contract_address || this.config.contractAddress,
            assetType: this.determineAssetType(rawAsset),
            metadata: {
                name: rawAsset.name || rawAsset.metadata?.name || 'Unknown Asset',
                description: rawAsset.description || rawAsset.metadata?.description || '',
                image: rawAsset.image || rawAsset.metadata?.image || '',
                attributes: rawAsset.attributes || rawAsset.metadata?.attributes || [],
                rarity: rawAsset.rarity || this.determineRarity(rawAsset)
            },
            owner: rawAsset.owner,
            tradeable: rawAsset.tradeable !== false // Default to true unless explicitly false
        };
    }

    protected normalizeAchievements(rawAchievements: any[]): Achievement[] {
        return rawAchievements.map(achievement => ({
            id: achievement.id,
            gameId: this.gameId,
            playerId: achievement.player_id,
            achievementType: achievement.type || achievement.achievement_type,
            title: achievement.title || achievement.name,
            description: achievement.description || '',
            rarity: achievement.rarity || 'COMMON',
            earnedAt: achievement.earned_at || achievement.timestamp || Date.now(),
            nftBadgeId: achievement.nft_badge_id
        }));
    }

    protected normalizeStatistics(rawStats: any): GameStatistics {
        return {
            gameId: this.gameId,
            playerId: rawStats.player_id,
            playtime: rawStats.playtime || 0,
            level: rawStats.level || 1,
            score: rawStats.score || 0,
            customStats: rawStats.custom_stats || {}
        };
    }

    private determineAssetType(rawAsset: any): 'NFT' | 'CURRENCY' | 'ITEM' {
        if (rawAsset.type) return rawAsset.type;
        if (rawAsset.token_id && rawAsset.contract_address) return 'NFT';
        if (rawAsset.fungible || rawAsset.is_currency) return 'CURRENCY';
        return 'ITEM';
    }

    private determineRarity(rawAsset: any): 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' {
        if (rawAsset.rarity) return rawAsset.rarity;

        // Simple rarity determination based on attributes or other factors
        const attributes = rawAsset.attributes || [];
        if (attributes.length > 5) return 'LEGENDARY';
        if (attributes.length > 3) return 'EPIC';
        if (attributes.length > 1) return 'RARE';
        return 'COMMON';
    }
}