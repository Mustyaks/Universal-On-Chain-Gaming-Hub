/**
 * Real-Time Update Manager
 * Handles real-time profile updates when game data changes
 */

import { EventEmitter } from 'events';
import {
    DatabaseService,
    CacheService,
    EventService
} from '@/types/services';
import {
    StandardizedGameData,
    PlayerGameData,
    UnifiedProfile,
    Timestamp
} from '@/types/core';
import { CrossGameAggregator, AggregatedPlayerData } from './CrossGameAggregator';

export interface UpdateSubscription {
    playerId: string;
    callback: (update: ProfileUpdate) => void;
    filters?: UpdateFilter[];
    createdAt: Timestamp;
}

export interface UpdateFilter {
    type: 'game' | 'achievement' | 'asset';
    gameId?: string;
    rarity?: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}

export interface ProfileUpdate {
    type: 'profile_updated' | 'achievement_earned' | 'asset_acquired' | 'game_data_synced';
    playerId: string;
    gameId?: string;
    data: any;
    timestamp: Timestamp;
}

export interface UpdateManagerConfig {
    maxSubscriptionsPerPlayer: number;
    updateBatchSize: number;
    updateBatchInterval: number; // milliseconds
    subscriptionTimeout: number; // milliseconds
}

export class RealTimeUpdateManager extends EventEmitter {
    private subscriptions = new Map<string, Set<UpdateSubscription>>();
    private pendingUpdates = new Map<string, ProfileUpdate[]>();
    private batchTimer: NodeJS.Timeout | null = null;

    constructor(
        private database: DatabaseService,
        private cache: CacheService,
        private eventService: EventService,
        private aggregator: CrossGameAggregator,
        private config: UpdateManagerConfig
    ) {
        super();
        this.setupEventListeners();
        this.startBatchProcessor();
    }

    /**
     * Subscribe to real-time profile updates
     */
    subscribe(playerId: string, callback: (update: ProfileUpdate) => void, filters?: UpdateFilter[]): string {
        const subscriptionId = this.generateSubscriptionId();

        // Check subscription limits
        const playerSubscriptions = this.subscriptions.get(playerId) || new Set();
        if (playerSubscriptions.size >= this.config.maxSubscriptionsPerPlayer) {
            throw new Error(`Maximum subscriptions reached for player ${playerId}`);
        }

        const subscription: UpdateSubscription = {
            playerId,
            callback,
            ...(filters && { filters }),
            createdAt: Date.now()
        };

        // Add subscription
        if (!this.subscriptions.has(playerId)) {
            this.subscriptions.set(playerId, new Set());
        }
        this.subscriptions.get(playerId)!.add(subscription);

        // Enable real-time updates for this player if first subscription
        if (playerSubscriptions.size === 0) {
            this.aggregator.enableRealTimeUpdates(playerId);
        }

        // Set up cleanup timer
        setTimeout(() => {
            this.unsubscribe(playerId, subscriptionId);
        }, this.config.subscriptionTimeout);

        return subscriptionId;
    }

    /**
     * Unsubscribe from profile updates
     */
    unsubscribe(playerId: string, subscriptionId: string): void {
        const playerSubscriptions = this.subscriptions.get(playerId);
        if (!playerSubscriptions) return;

        // Find and remove subscription
        for (const subscription of playerSubscriptions) {
            if (this.getSubscriptionId(subscription) === subscriptionId) {
                playerSubscriptions.delete(subscription);
                break;
            }
        }

        // Clean up if no more subscriptions
        if (playerSubscriptions.size === 0) {
            this.subscriptions.delete(playerId);
            this.aggregator.disableRealTimeUpdates(playerId);
        }
    }

    /**
     * Process game data update and notify subscribers
     */
    async processGameDataUpdate(playerId: string, gameData: StandardizedGameData): Promise<void> {
        try {
            // Create update object
            const update: ProfileUpdate = {
                type: 'game_data_synced',
                playerId,
                gameId: gameData.gameId,
                data: {
                    assetsCount: gameData.assets.length,
                    achievementsCount: gameData.achievements.length,
                    lastUpdated: gameData.lastUpdated
                },
                timestamp: Date.now()
            };

            // Queue update for batch processing
            this.queueUpdate(playerId, update);

            // Process new achievements
            for (const achievement of gameData.achievements) {
                const achievementUpdate: ProfileUpdate = {
                    type: 'achievement_earned',
                    playerId,
                    gameId: gameData.gameId,
                    data: achievement,
                    timestamp: achievement.earnedAt
                };
                this.queueUpdate(playerId, achievementUpdate);
            }

            // Process new assets
            for (const asset of gameData.assets) {
                const assetUpdate: ProfileUpdate = {
                    type: 'asset_acquired',
                    playerId,
                    gameId: gameData.gameId,
                    data: asset,
                    timestamp: Date.now()
                };
                this.queueUpdate(playerId, assetUpdate);
            }

        } catch (error) {
            console.error(`Error processing game data update for player ${playerId}:`, error);
        }
    }

    /**
     * Process profile update and notify subscribers
     */
    async processProfileUpdate(playerId: string, aggregatedData: AggregatedPlayerData): Promise<void> {
        const update: ProfileUpdate = {
            type: 'profile_updated',
            playerId,
            data: {
                totalAssets: aggregatedData.totalAssets,
                totalAchievements: aggregatedData.totalAchievements,
                crossGameAssets: aggregatedData.crossGameAssets.length,
                lastAggregated: aggregatedData.lastAggregated
            },
            timestamp: Date.now()
        };

        this.queueUpdate(playerId, update);
    }

    /**
     * Get active subscriptions count
     */
    getActiveSubscriptionsCount(): number {
        let total = 0;
        for (const subscriptions of this.subscriptions.values()) {
            total += subscriptions.size;
        }
        return total;
    }

    /**
     * Get subscriptions for a specific player
     */
    getPlayerSubscriptions(playerId: string): number {
        return this.subscriptions.get(playerId)?.size || 0;
    }

    /**
     * Queue update for batch processing
     */
    private queueUpdate(playerId: string, update: ProfileUpdate): void {
        if (!this.pendingUpdates.has(playerId)) {
            this.pendingUpdates.set(playerId, []);
        }

        const updates = this.pendingUpdates.get(playerId)!;
        updates.push(update);

        // Limit queue size to prevent memory issues
        if (updates.length > this.config.updateBatchSize * 2) {
            updates.splice(0, updates.length - this.config.updateBatchSize);
        }
    }

    /**
     * Process batched updates
     */
    private processBatchedUpdates(): void {
        for (const [playerId, updates] of this.pendingUpdates.entries()) {
            if (updates.length === 0) continue;

            // Get batch of updates
            const batch = updates.splice(0, this.config.updateBatchSize);

            // Notify subscribers
            this.notifySubscribers(playerId, batch);
        }

        // Clean up empty queues
        for (const [playerId, updates] of this.pendingUpdates.entries()) {
            if (updates.length === 0) {
                this.pendingUpdates.delete(playerId);
            }
        }
    }

    /**
     * Notify subscribers of updates
     */
    private notifySubscribers(playerId: string, updates: ProfileUpdate[]): void {
        const subscriptions = this.subscriptions.get(playerId);
        if (!subscriptions) return;

        for (const subscription of subscriptions) {
            for (const update of updates) {
                // Apply filters
                if (this.shouldNotifySubscription(subscription, update)) {
                    try {
                        subscription.callback(update);
                    } catch (error) {
                        console.error('Error notifying subscriber:', error);
                    }
                }
            }
        }
    }

    /**
     * Check if subscription should be notified based on filters
     */
    private shouldNotifySubscription(subscription: UpdateSubscription, update: ProfileUpdate): boolean {
        if (!subscription.filters || subscription.filters.length === 0) {
            return true;
        }

        for (const filter of subscription.filters) {
            // Check type filter
            if (filter.type === 'game' && update.gameId !== filter.gameId) {
                continue;
            }

            if (filter.type === 'achievement' && update.type !== 'achievement_earned') {
                continue;
            }

            if (filter.type === 'asset' && update.type !== 'asset_acquired') {
                continue;
            }

            // Check rarity filter
            if (filter.rarity && update.data?.rarity !== filter.rarity) {
                continue;
            }

            // If we reach here, filter matches
            return true;
        }

        return false;
    }

    /**
     * Generate unique subscription ID
     */
    private generateSubscriptionId(): string {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get subscription ID from subscription object
     */
    private getSubscriptionId(subscription: UpdateSubscription): string {
        return `sub_${subscription.createdAt}_${subscription.playerId}`;
    }

    /**
     * Start batch processor
     */
    private startBatchProcessor(): void {
        this.batchTimer = setInterval(() => {
            this.processBatchedUpdates();
        }, this.config.updateBatchInterval);
    }

    /**
     * Stop batch processor
     */
    private stopBatchProcessor(): void {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(): void {
        this.eventService.on('player_data:updated', async (data: { playerId: string; gameData: StandardizedGameData }) => {
            await this.processGameDataUpdate(data.playerId, data.gameData);
        });

        this.eventService.on('profile:aggregated', async (data: { playerId: string; aggregatedData: AggregatedPlayerData }) => {
            await this.processProfileUpdate(data.playerId, data.aggregatedData);
        });

        // Clean up on process exit
        process.on('SIGINT', () => {
            this.stopBatchProcessor();
        });

        process.on('SIGTERM', () => {
            this.stopBatchProcessor();
        });
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this.stopBatchProcessor();
        this.subscriptions.clear();
        this.pendingUpdates.clear();
        this.removeAllListeners();
    }
}