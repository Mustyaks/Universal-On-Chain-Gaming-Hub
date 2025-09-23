/**
 * Profile Aggregation Service
 * Handles cross-game data aggregation and real-time profile updates
 */

import {
    DatabaseService,
    CacheService,
    EventService,
    AggregationService
} from '@/types/services';
import {
    UnifiedProfile,
    GameAsset,
    Achievement,
    CrossGameAsset,
    StandardizedGameData,
    PlayerGameData,
    Timestamp
} from '@/types/core';

export interface ProfileAggregationConfig {
    cacheTimeout: number; // seconds
    realTimeUpdates: boolean;
    maxCrossGameAssets: number;
}

export class ProfileAggregationService {
    private updateSubscriptions = new Map<string, Set<(data: any) => void>>();

    constructor(
        private database: DatabaseService,
        private cache: CacheService,
        private eventService: EventService,
        private aggregationService: AggregationService,
        private config: ProfileAggregationConfig
    ) {
        this.setupEventListeners();
    }

    /**
     * Aggregate cross-game data for a player profile
     */
    async aggregateCrossGameData(playerId: string): Promise<CrossGameAsset[]> {
        const cacheKey = `cross_game_assets:${playerId}`;

        // Try cache first
        const cached = await this.cache.get<CrossGameAsset[]>(cacheKey);
        if (cached) {
            return cached;
        }

        // Get all game data for the player
        const gameData = await this.aggregationService.syncPlayerData(playerId);

        // Group assets by game and calculate values
        const crossGameAssets = this.processCrossGameAssets(gameData);

        // Cache the result
        await this.cache.set(cacheKey, crossGameAssets, this.config.cacheTimeout);

        return crossGameAssets;
    }

    /**
     * Update profile with real-time game data changes
     */
    async updateProfileFromGameData(playerId: string, gameData: StandardizedGameData): Promise<void> {
        try {
            // Get current profile
            const profile = await this.database.findOne<UnifiedProfile>('profiles', { playerId });
            if (!profile) {
                throw new Error(`Profile not found for player: ${playerId}`);
            }

            // Calculate new aggregated data
            const updatedCrossGameAssets = await this.aggregateCrossGameData(playerId);
            const totalAchievements = await this.getTotalAchievements(playerId);

            // Update profile with new aggregated data
            const updates = {
                crossGameAssets: updatedCrossGameAssets,
                totalAchievements
            };

            await this.database.updateOne('profiles', playerId, updates);

            // Invalidate related caches
            await this.invalidateProfileCaches(playerId);

            // Emit profile update event
            this.eventService.emit('profile:data_updated', {
                playerId,
                gameId: gameData.gameId,
                updates
            });

            // Notify real-time subscribers
            if (this.config.realTimeUpdates) {
                this.notifySubscribers(playerId, { type: 'profile_updated', data: updates });
            }

        } catch (error) {
            console.error(`Failed to update profile for player ${playerId}:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to real-time profile updates
     */
    subscribeToProfileUpdates(playerId: string, callback: (data: any) => void): void {
        if (!this.updateSubscriptions.has(playerId)) {
            this.updateSubscriptions.set(playerId, new Set());
        }

        this.updateSubscriptions.get(playerId)!.add(callback);

        // Set up aggregation service subscription if this is the first subscriber
        if (this.updateSubscriptions.get(playerId)!.size === 1) {
            this.aggregationService.subscribeToPlayerUpdates(playerId, (gameData) => {
                this.updateProfileFromGameData(playerId, gameData);
            });
        }
    }

    /**
     * Unsubscribe from profile updates
     */
    unsubscribeFromProfileUpdates(playerId: string, callback: (data: any) => void): void {
        const subscribers = this.updateSubscriptions.get(playerId);
        if (subscribers) {
            subscribers.delete(callback);

            // Clean up if no more subscribers
            if (subscribers.size === 0) {
                this.updateSubscriptions.delete(playerId);
            }
        }
    }

    /**
     * Get profile statistics across all games
     */
    async getProfileStatistics(playerId: string): Promise<ProfileStatistics> {
        const cacheKey = `profile_stats:${playerId}`;

        // Try cache first
        const cached = await this.cache.get<ProfileStatistics>(cacheKey);
        if (cached) {
            return cached;
        }

        // Calculate statistics
        const [assets, achievements, gameProfiles] = await Promise.all([
            this.database.findMany<GameAsset>('game_assets', { owner: playerId }),
            this.database.findMany<Achievement>('achievements', { playerId }),
            this.database.findMany('game_profiles', { playerId })
        ]);

        const stats: ProfileStatistics = {
            totalGamesPlayed: gameProfiles.length,
            totalAssets: assets.length,
            totalAchievements: achievements.length,
            rarityBreakdown: this.calculateRarityBreakdown(achievements),
            gameBreakdown: this.calculateGameBreakdown(assets, achievements),
            recentActivity: this.getRecentActivity(assets, achievements),
            totalValue: this.calculateTotalValue(assets)
        };

        // Cache for 5 minutes
        await this.cache.set(cacheKey, stats, 300);

        return stats;
    }

    /**
     * Process cross-game assets from standardized game data
     */
    private processCrossGameAssets(gameDataArray: StandardizedGameData[]): CrossGameAsset[] {
        const gameAssetMap = new Map<string, GameAsset[]>();

        // Group assets by game
        for (const gameData of gameDataArray) {
            if (!gameAssetMap.has(gameData.gameId)) {
                gameAssetMap.set(gameData.gameId, []);
            }
            gameAssetMap.get(gameData.gameId)!.push(...gameData.assets);
        }

        // Convert to CrossGameAsset format
        const crossGameAssets: CrossGameAsset[] = [];

        for (const [gameId, assets] of gameAssetMap.entries()) {
            // Limit assets per game to prevent excessive data
            const limitedAssets = assets.slice(0, this.config.maxCrossGameAssets);

            crossGameAssets.push({
                gameId,
                assets: limitedAssets,
                totalValue: this.calculateAssetsValue(limitedAssets)
            });
        }

        return crossGameAssets.sort((a, b) => b.totalValue - a.totalValue);
    }

    /**
     * Calculate total value of assets
     */
    private calculateAssetsValue(assets: GameAsset[]): number {
        // This would integrate with marketplace pricing in a real implementation
        let totalValue = 0;

        for (const asset of assets) {
            // Simple value calculation based on rarity and type
            let baseValue = 100;

            if (asset.metadata.rarity) {
                switch (asset.metadata.rarity) {
                    case 'LEGENDARY': baseValue *= 10; break;
                    case 'EPIC': baseValue *= 5; break;
                    case 'RARE': baseValue *= 2; break;
                    default: break;
                }
            }

            if (asset.assetType === 'NFT') {
                baseValue *= 2;
            }

            totalValue += baseValue;
        }

        return totalValue;
    }

    /**
     * Get total achievements count for a player
     */
    private async getTotalAchievements(playerId: string): Promise<number> {
        const achievements = await this.database.findMany<Achievement>(
            'achievements',
            { playerId }
        );
        return achievements.length;
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
     * Calculate game breakdown statistics
     */
    private calculateGameBreakdown(assets: GameAsset[], achievements: Achievement[]): Record<string, GameStats> {
        const gameStats: Record<string, GameStats> = {};

        // Process assets
        for (const asset of assets) {
            if (!gameStats[asset.gameId]) {
                gameStats[asset.gameId] = { assets: 0, achievements: 0, lastActivity: 0 };
            }
            const assetStats = gameStats[asset.gameId];
            if (assetStats) {
                assetStats.assets++;
            }
        }

        // Process achievements
        for (const achievement of achievements) {
            if (!gameStats[achievement.gameId]) {
                gameStats[achievement.gameId] = { assets: 0, achievements: 0, lastActivity: 0 };
            }
            const achievementStats = gameStats[achievement.gameId];
            if (achievementStats) {
                achievementStats.achievements++;
                achievementStats.lastActivity = Math.max(
                    achievementStats.lastActivity,
                    achievement.earnedAt
                );
            }
        }

        return gameStats;
    }

    /**
     * Get recent activity (last 7 days)
     */
    private getRecentActivity(assets: GameAsset[], achievements: Achievement[]): RecentActivity[] {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        const recentAchievements = achievements
            .filter(a => a.earnedAt > sevenDaysAgo)
            .map(a => ({
                type: 'achievement' as const,
                gameId: a.gameId,
                title: a.title,
                timestamp: a.earnedAt
            }));

        return recentAchievements
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10);
    }

    /**
     * Calculate total portfolio value
     */
    private calculateTotalValue(assets: GameAsset[]): number {
        return this.calculateAssetsValue(assets);
    }

    /**
     * Invalidate all profile-related caches
     */
    private async invalidateProfileCaches(playerId: string): Promise<void> {
        const patterns = [
            `profile:${playerId}`,
            `cross_game_assets:${playerId}`,
            `profile_stats:${playerId}`,
            `aggregated:${playerId}`
        ];

        await Promise.all(patterns.map(pattern => this.cache.delete(pattern)));
    }

    /**
     * Notify real-time subscribers
     */
    private notifySubscribers(playerId: string, data: any): void {
        const subscribers = this.updateSubscriptions.get(playerId);
        if (subscribers) {
            subscribers.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error notifying subscriber:', error);
                }
            });
        }
    }

    /**
     * Set up event listeners for game data changes
     */
    private setupEventListeners(): void {
        this.eventService.on('game_data:updated', async (data: { playerId: string; gameData: StandardizedGameData }) => {
            await this.updateProfileFromGameData(data.playerId, data.gameData);
        });

        this.eventService.on('achievement:earned', async (data: { playerId: string; achievement: Achievement }) => {
            await this.invalidateProfileCaches(data.playerId);
        });

        this.eventService.on('asset:acquired', async (data: { playerId: string; asset: GameAsset }) => {
            await this.invalidateProfileCaches(data.playerId);
        });
    }
}

// Supporting interfaces
export interface ProfileStatistics {
    totalGamesPlayed: number;
    totalAssets: number;
    totalAchievements: number;
    rarityBreakdown: Record<string, number>;
    gameBreakdown: Record<string, GameStats>;
    recentActivity: RecentActivity[];
    totalValue: number;
}

export interface GameStats {
    assets: number;
    achievements: number;
    lastActivity: Timestamp;
}

export interface RecentActivity {
    type: 'achievement' | 'asset' | 'transaction';
    gameId: string;
    title: string;
    timestamp: Timestamp;
}