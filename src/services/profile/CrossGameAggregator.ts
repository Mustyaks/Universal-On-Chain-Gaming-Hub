/**
 * Cross-Game Asset and Achievement Aggregator
 * Handles data aggregation from multiple game sources with real-time updates
 */

import {
    DatabaseService,
    CacheService,
    EventService,
    AggregationService
} from '@/types/services';
import {
    GameAsset,
    Achievement,
    CrossGameAsset,
    StandardizedGameData,

    Timestamp
} from '@/types/core';

export interface AggregationConfig {
    updateInterval: number; // milliseconds
    batchSize: number;
    maxRetries: number;
    cacheTimeout: number; // seconds
}

export interface GameDataSource {
    gameId: string;
    lastSyncTime: Timestamp;
    syncStatus: 'ACTIVE' | 'PAUSED' | 'ERROR';
    errorCount: number;
}

export class CrossGameAggregator {
    private syncIntervals = new Map<string, NodeJS.Timeout>();
    private gameDataSources = new Map<string, GameDataSource>();

    constructor(
        private database: DatabaseService,
        private cache: CacheService,
        private eventService: EventService,
        private aggregationService: AggregationService,
        private config: AggregationConfig
    ) {
        this.setupEventListeners();
    }

    /**
     * Aggregate assets and achievements from multiple games for a player
     */
    async aggregatePlayerData(playerId: string): Promise<AggregatedPlayerData> {
        const cacheKey = `aggregated_player_data:${playerId}`;

        // Try cache first
        const cached = await this.cache.get<AggregatedPlayerData>(cacheKey);
        if (cached) {
            return cached;
        }

        // Get all game data for the player
        const gameData = await this.aggregationService.syncPlayerData(playerId);

        // Process and aggregate the data
        const aggregatedData = await this.processAggregatedData(playerId, gameData);

        // Cache the result
        await this.cache.set(cacheKey, aggregatedData, this.config.cacheTimeout);

        return aggregatedData;
    }

    /**
     * Get unified dashboard data for a player
     */
    async getUnifiedDashboardData(playerId: string): Promise<UnifiedDashboardData> {
        const [aggregatedData, recentActivity, gameStatistics] = await Promise.all([
            this.aggregatePlayerData(playerId),
            this.getRecentActivity(playerId),
            this.getGameStatistics(playerId)
        ]);

        return {
            playerId,
            totalAssets: aggregatedData.totalAssets,
            totalAchievements: aggregatedData.totalAchievements,
            crossGameAssets: aggregatedData.crossGameAssets,
            topAchievements: aggregatedData.topAchievements,
            recentActivity,
            gameStatistics,
            lastUpdated: Date.now()
        };
    }

    /**
     * Set up real-time updates for a player's data
     */
    async enableRealTimeUpdates(playerId: string): Promise<void> {
        // Subscribe to game data updates
        this.aggregationService.subscribeToPlayerUpdates(playerId, async (gameData) => {
            await this.handleGameDataUpdate(playerId, gameData);
        });

        // Set up periodic sync for this player
        const intervalId = setInterval(async () => {
            try {
                await this.syncPlayerDataFromAllGames(playerId);
            } catch (error) {
                console.error(`Error syncing data for player ${playerId}:`, error);
            }
        }, this.config.updateInterval);

        this.syncIntervals.set(playerId, intervalId);
    }

    /**
     * Disable real-time updates for a player
     */
    disableRealTimeUpdates(playerId: string): void {
        const intervalId = this.syncIntervals.get(playerId);
        if (intervalId) {
            clearInterval(intervalId);
            this.syncIntervals.delete(playerId);
        }
    }

    /**
     * Handle real-time game data updates
     */
    private async handleGameDataUpdate(playerId: string, gameData: StandardizedGameData): Promise<void> {
        try {
            // Update cached aggregated data
            await this.invalidatePlayerCache(playerId);

            // Re-aggregate data with new information
            const updatedData = await this.aggregatePlayerData(playerId);

            // Update profile with new totals
            await this.updateProfileTotals(playerId, updatedData);

            // Emit update event
            this.eventService.emit('player_data:updated', {
                playerId,
                gameId: gameData.gameId,
                updatedData
            });

            // Update game data source status
            this.updateGameDataSourceStatus(gameData.gameId, 'ACTIVE');

        } catch (error) {
            console.error(`Error handling game data update for player ${playerId}:`, error);
            this.updateGameDataSourceStatus(gameData.gameId, 'ERROR');
        }
    }

    /**
     * Process and aggregate data from multiple games
     */
    private async processAggregatedData(playerId: string, gameDataArray: StandardizedGameData[]): Promise<AggregatedPlayerData> {
        const allAssets: GameAsset[] = [];
        const allAchievements: Achievement[] = [];
        const crossGameAssets: CrossGameAsset[] = [];

        // Process each game's data
        for (const gameData of gameDataArray) {
            allAssets.push(...gameData.assets);
            allAchievements.push(...gameData.achievements);

            // Create cross-game asset entry
            if (gameData.assets.length > 0) {
                crossGameAssets.push({
                    gameId: gameData.gameId,
                    assets: gameData.assets,
                    totalValue: this.calculateAssetsValue(gameData.assets)
                });
            }
        }

        // Sort cross-game assets by value
        crossGameAssets.sort((a, b) => b.totalValue - a.totalValue);

        // Get top achievements (by rarity and recency)
        const topAchievements = this.getTopAchievements(allAchievements);

        return {
            playerId,
            totalAssets: allAssets.length,
            totalAchievements: allAchievements.length,
            crossGameAssets,
            topAchievements,
            assetsByGame: this.groupAssetsByGame(allAssets),
            achievementsByGame: this.groupAchievementsByGame(allAchievements),
            lastAggregated: Date.now()
        };
    }

    /**
     * Get recent activity across all games
     */
    private async getRecentActivity(playerId: string, days: number = 7): Promise<RecentActivity[]> {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

        const [recentAchievements, recentAssets] = await Promise.all([
            this.database.findMany<Achievement>('achievements', {
                playerId,
                earnedAt: { $gt: cutoffTime }
            }, { sort: { earnedAt: -1 }, limit: 20 }),

            // Assuming we track asset acquisition times
            this.database.findMany<GameAsset>('game_assets', {
                owner: playerId,
                acquiredAt: { $gt: cutoffTime }
            }, { sort: { acquiredAt: -1 }, limit: 10 })
        ]);

        const activities: RecentActivity[] = [];

        // Add achievement activities
        for (const achievement of recentAchievements) {
            activities.push({
                type: 'achievement',
                gameId: achievement.gameId,
                title: `Earned: ${achievement.title}`,
                description: achievement.description,
                timestamp: achievement.earnedAt,
                rarity: achievement.rarity
            });
        }

        // Add asset acquisition activities
        for (const asset of recentAssets) {
            activities.push({
                type: 'asset',
                gameId: asset.gameId,
                title: `Acquired: ${asset.metadata.name}`,
                description: asset.metadata.description,
                timestamp: (asset as any).acquiredAt || Date.now(),
                rarity: asset.metadata.rarity || 'COMMON'
            });
        }

        // Sort by timestamp and return top 15
        return activities
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 15);
    }

    /**
     * Get game statistics for a player
     */
    private async getGameStatistics(playerId: string): Promise<Record<string, GameStatistics>> {
        const gameProfiles = await this.database.findMany('game_profiles', { playerId });
        const statistics: Record<string, GameStatistics> = {};

        for (const profile of gameProfiles) {
            const gameProfile = profile as any;
            const [assets, achievements] = await Promise.all([
                this.database.findMany<GameAsset>('game_assets', {
                    owner: playerId,
                    gameId: gameProfile.gameId
                }),
                this.database.findMany<Achievement>('achievements', {
                    playerId,
                    gameId: gameProfile.gameId
                })
            ]);

            statistics[gameProfile.gameId] = {
                gameId: gameProfile.gameId,
                totalAssets: assets.length,
                totalAchievements: achievements.length,
                totalValue: this.calculateAssetsValue(assets),
                rarityBreakdown: this.calculateRarityBreakdown(achievements),
                lastActivity: gameProfile.lastActive || 0,
                playtime: gameProfile.gameSpecificData?.playtime || 0
            };
        }

        return statistics;
    }

    /**
     * Sync player data from all registered games
     */
    private async syncPlayerDataFromAllGames(playerId: string): Promise<void> {
        try {
            const gameData = await this.aggregationService.syncPlayerData(playerId);

            // Process in batches to avoid overwhelming the system
            const batches = this.createBatches(gameData, this.config.batchSize);

            for (const batch of batches) {
                await Promise.all(batch.map(data =>
                    this.handleGameDataUpdate(playerId, data)
                ));
            }

        } catch (error) {
            console.error(`Error syncing all game data for player ${playerId}:`, error);
            throw error;
        }
    }

    /**
     * Update profile with new aggregated totals
     */
    private async updateProfileTotals(playerId: string, aggregatedData: AggregatedPlayerData): Promise<void> {
        const updates = {
            totalAchievements: aggregatedData.totalAchievements,
            crossGameAssets: aggregatedData.crossGameAssets
        };

        await this.database.updateOne('profiles', playerId, updates);
    }

    /**
     * Calculate total value of assets
     */
    private calculateAssetsValue(assets: GameAsset[]): number {
        return assets.reduce((total, asset) => {
            let value = 100; // Base value

            // Adjust by rarity
            switch (asset.metadata.rarity) {
                case 'LEGENDARY': value *= 10; break;
                case 'EPIC': value *= 5; break;
                case 'RARE': value *= 2; break;
                default: break;
            }

            // Adjust by type
            if (asset.assetType === 'NFT') value *= 2;

            return total + value;
        }, 0);
    }

    /**
     * Get top achievements by rarity and recency
     */
    private getTopAchievements(achievements: Achievement[]): Achievement[] {
        const rarityWeight = { LEGENDARY: 4, EPIC: 3, RARE: 2, COMMON: 1 };

        return achievements
            .sort((a, b) => {
                const weightDiff = rarityWeight[b.rarity] - rarityWeight[a.rarity];
                if (weightDiff !== 0) return weightDiff;
                return b.earnedAt - a.earnedAt;
            })
            .slice(0, 10);
    }

    /**
     * Group assets by game ID
     */
    private groupAssetsByGame(assets: GameAsset[]): Record<string, GameAsset[]> {
        return assets.reduce((groups, asset) => {
            if (!groups[asset.gameId]) {
                groups[asset.gameId] = [];
            }
            const group = groups[asset.gameId];
            if (group) {
                group.push(asset);
            }
            return groups;
        }, {} as Record<string, GameAsset[]>);
    }

    /**
     * Group achievements by game ID
     */
    private groupAchievementsByGame(achievements: Achievement[]): Record<string, Achievement[]> {
        return achievements.reduce((groups, achievement) => {
            if (!groups[achievement.gameId]) {
                groups[achievement.gameId] = [];
            }
            const group = groups[achievement.gameId];
            if (group) {
                group.push(achievement);
            }
            return groups;
        }, {} as Record<string, Achievement[]>);
    }

    /**
     * Calculate rarity breakdown for achievements
     */
    private calculateRarityBreakdown(achievements: Achievement[]): Record<string, number> {
        const breakdown = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };

        for (const achievement of achievements) {
            breakdown[achievement.rarity]++;
        }

        return breakdown;
    }

    /**
     * Create batches from array
     */
    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Invalidate player cache
     */
    private async invalidatePlayerCache(playerId: string): Promise<void> {
        const patterns = [
            `aggregated_player_data:${playerId}`,
            `unified_dashboard:${playerId}`,
            `recent_activity:${playerId}`,
            `game_statistics:${playerId}`
        ];

        await Promise.all(patterns.map(pattern => this.cache.delete(pattern)));
    }

    /**
     * Update game data source status
     */
    private updateGameDataSourceStatus(gameId: string, status: 'ACTIVE' | 'PAUSED' | 'ERROR'): void {
        const source = this.gameDataSources.get(gameId) || {
            gameId,
            lastSyncTime: 0,
            syncStatus: 'ACTIVE',
            errorCount: 0
        };

        source.syncStatus = status;
        source.lastSyncTime = Date.now();

        if (status === 'ERROR') {
            source.errorCount++;
        } else if (status === 'ACTIVE') {
            source.errorCount = 0;
        }

        this.gameDataSources.set(gameId, source);
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(): void {
        this.eventService.on('game:data_updated', async (data: { playerId: string; gameData: StandardizedGameData }) => {
            await this.handleGameDataUpdate(data.playerId, data.gameData);
        });

        this.eventService.on('player:profile_created', async (data: { playerId: string }) => {
            await this.enableRealTimeUpdates(data.playerId);
        });
    }
}

// Supporting interfaces
export interface AggregatedPlayerData {
    playerId: string;
    totalAssets: number;
    totalAchievements: number;
    crossGameAssets: CrossGameAsset[];
    topAchievements: Achievement[];
    assetsByGame: Record<string, GameAsset[]>;
    achievementsByGame: Record<string, Achievement[]>;
    lastAggregated: Timestamp;
}

export interface UnifiedDashboardData {
    playerId: string;
    totalAssets: number;
    totalAchievements: number;
    crossGameAssets: CrossGameAsset[];
    topAchievements: Achievement[];
    recentActivity: RecentActivity[];
    gameStatistics: Record<string, GameStatistics>;
    lastUpdated: Timestamp;
}

export interface RecentActivity {
    type: 'achievement' | 'asset' | 'transaction';
    gameId: string;
    title: string;
    description: string;
    timestamp: Timestamp;
    rarity?: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}

export interface GameStatistics {
    gameId: string;
    totalAssets: number;
    totalAchievements: number;
    totalValue: number;
    rarityBreakdown: Record<string, number>;
    lastActivity: Timestamp;
    playtime: number;
}