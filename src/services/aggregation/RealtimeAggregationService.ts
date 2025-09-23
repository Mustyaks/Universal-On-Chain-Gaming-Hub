/**
 * Real-time Aggregation Service
 * Orchestrates real-time data synchronization across all components
 */

import { EventEmitter } from 'events';
import {
    StandardizedGameData,
    PlayerGameData,
    GameHubError,
    Timestamp
} from '../../types/core';
import { GameAdapter } from './GameAdapter';
import { RealtimeSyncService, RealtimeSyncConfig, GameDataUpdate } from './RealtimeSyncService';
import { RedisEventManager, RedisEventConfig } from './RedisEventManager';
import { DataValidationService, ValidationConfig, ValidationResult } from './DataValidationService';

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

export class RealtimeAggregationService extends EventEmitter {
    private config: RealtimeAggregationConfig;
    private syncService: RealtimeSyncService;
    private redisManager: RedisEventManager;
    private validationService: DataValidationService;
    
    private gameAdapters: Map<string, GameAdapter> = new Map();
    private playerSubscriptions: Map<string, PlayerSubscription> = new Map();
    private updateQueue: GameDataUpdate[] = [];
    private metrics: AggregationMetrics;
    
    private flushTimer: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    constructor(config: RealtimeAggregationConfig) {
        super();
        this.config = config;
        
        // Initialize services
        this.syncService = new RealtimeSyncService(config.sync);
        this.redisManager = new RedisEventManager(config.redis);
        this.validationService = new DataValidationService(config.validation);
        
        // Initialize metrics
        this.metrics = {
            totalUpdates: 0,
            validUpdates: 0,
            invalidUpdates: 0,
            averageValidationTime: 0,
            averageProcessingTime: 0,
            activeSubscriptions: 0,
            cacheHitRate: 0
        };
        
        this.setupEventHandlers();
    }

    /**
     * Initialize the real-time aggregation service
     */
    async initialize(): Promise<void> {
        try {
            // Initialize all services
            await Promise.all([
                this.syncService.initialize(),
                this.redisManager.initialize()
            ]);

            // Start the update processing loop
            this.startUpdateProcessing();
            
            this.isRunning = true;
            this.emit('initialized');
            
            console.log('RealtimeAggregationService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize RealtimeAggregationService:', error);
            throw error;
        }
    }

    /**
     * Register a game adapter for real-time updates
     */
    async registerGameAdapter(adapter: GameAdapter): Promise<void> {
        if (this.gameAdapters.has(adapter.gameId)) {
            throw new Error(`Game adapter for ${adapter.gameId} already registered`);
        }

        // Register with sync service
        await this.syncService.registerGameAdapter(adapter);
        
        // Store adapter reference
        this.gameAdapters.set(adapter.gameId, adapter);
        
        // Set up adapter event handlers
        this.setupAdapterEventHandlers(adapter);
        
        console.log(`Registered game adapter: ${adapter.gameId}`);
        this.emit('adapterRegistered', { gameId: adapter.gameId });
    }

    /**
     * Subscribe to real-time updates for a player across all games
     */
    async subscribeToPlayer(
        playerId: string,
        callback: (update: GameDataUpdate) => void,
        gameIds?: string[]
    ): Promise<void> {
        const subscription: PlayerSubscription = {
            playerId,
            gameIds: new Set(gameIds || Array.from(this.gameAdapters.keys())),
            callback,
            subscribedAt: Date.now()
        };

        // Store subscription
        this.playerSubscriptions.set(playerId, subscription);
        
        // Subscribe to Redis events for this player
        await this.redisManager.subscribeToChannel(
            `player:${playerId}:updates`,
            (data: GameDataUpdate) => {
                if (subscription.gameIds.has(data.gameId)) {
                    callback(data);
                }
            }
        );

        // Subscribe to game adapters for real-time updates
        for (const gameId of subscription.gameIds) {
            const adapter = this.gameAdapters.get(gameId);
            if (adapter) {
                // Subscribe to player updates if adapter supports it
                if ('subscribeToPlayerUpdates' in adapter && typeof adapter.subscribeToPlayerUpdates === 'function') {
                    await (adapter as any).subscribeToPlayerUpdates(playerId);
                }
            }
        }

        this.metrics.activeSubscriptions = this.playerSubscriptions.size;
        
        console.log(`Subscribed to player ${playerId} updates for games: ${Array.from(subscription.gameIds).join(', ')}`);
        this.emit('playerSubscribed', { playerId, gameIds: Array.from(subscription.gameIds) });
    }

    /**
     * Unsubscribe from player updates
     */
    async unsubscribeFromPlayer(playerId: string): Promise<void> {
        const subscription = this.playerSubscriptions.get(playerId);
        if (!subscription) {
            return;
        }

        // Unsubscribe from Redis events
        await this.redisManager.unsubscribeFromChannel(`player:${playerId}:updates`);

        // Unsubscribe from game adapters
        for (const gameId of subscription.gameIds) {
            const adapter = this.gameAdapters.get(gameId);
            if (adapter) {
                // Unsubscribe from player updates if adapter supports it
                if ('unsubscribeFromPlayerUpdates' in adapter && typeof adapter.unsubscribeFromPlayerUpdates === 'function') {
                    await (adapter as any).unsubscribeFromPlayerUpdates(playerId);
                }
            }
        }

        // Remove subscription
        this.playerSubscriptions.delete(playerId);
        this.metrics.activeSubscriptions = this.playerSubscriptions.size;
        
        console.log(`Unsubscribed from player ${playerId} updates`);
        this.emit('playerUnsubscribed', { playerId });
    }

    /**
     * Process a game data update
     */
    async processGameDataUpdate(
        playerId: string,
        gameId: string,
        data: StandardizedGameData,
        source: 'WEBSOCKET' | 'POLLING' | 'MANUAL' = 'WEBSOCKET'
    ): Promise<void> {
        const startTime = Date.now();
        
        try {
            // Validate the data
            const validation = await this.validateGameData(data);
            
            if (!validation.isValid) {
                this.metrics.invalidUpdates++;
                console.warn(`Invalid game data for ${playerId}/${gameId}:`, validation.errors);
                this.emit('validationFailed', { playerId, gameId, validation });
                return;
            }

            // Create update object
            const update: GameDataUpdate = {
                playerId,
                gameId,
                updateType: this.determineUpdateType(data),
                data,
                timestamp: Date.now(),
                source
            };

            // Add to processing queue
            this.updateQueue.push(update);
            
            // Process immediately if queue is full
            if (this.updateQueue.length >= this.config.aggregation.batchSize) {
                await this.flushUpdateQueue();
            }

            this.metrics.totalUpdates++;
            this.metrics.validUpdates++;
            
            // Update processing time metric
            const processingTime = Date.now() - startTime;
            this.updateAverageMetric('averageProcessingTime', processingTime);
            
        } catch (error) {
            this.metrics.invalidUpdates++;
            console.error(`Failed to process game data update for ${playerId}/${gameId}:`, error);
            this.emit('processingError', { playerId, gameId, error });
        }
    }

    /**
     * Get cached game data for a player
     */
    async getCachedGameData(playerId: string, gameId: string): Promise<StandardizedGameData | null> {
        try {
            const cached = await this.redisManager.getCachedGameData(playerId, gameId);
            
            if (cached) {
                // Update cache hit rate
                this.updateCacheHitRate(true);
                return cached;
            } else {
                this.updateCacheHitRate(false);
                return null;
            }
        } catch (error) {
            console.error(`Failed to get cached data for ${playerId}/${gameId}:`, error);
            this.updateCacheHitRate(false);
            return null;
        }
    }

    /**
     * Get aggregation metrics
     */
    getMetrics(): AggregationMetrics {
        return { ...this.metrics };
    }

    /**
     * Get service health status
     */
    async getHealthStatus(): Promise<{
        healthy: boolean;
        services: Record<string, boolean>;
        metrics: AggregationMetrics;
    }> {
        const [syncHealth, redisHealth] = await Promise.all([
            this.syncService.getHealthStatus(),
            this.redisManager.isHealthy()
        ]);

        const services = {
            sync: syncHealth.healthy,
            redis: redisHealth,
            validation: true, // Validation service is stateless
            aggregation: this.isRunning
        };

        const healthy = Object.values(services).every(status => status);

        return {
            healthy,
            services,
            metrics: this.getMetrics()
        };
    }

    /**
     * Shutdown the service gracefully
     */
    async shutdown(): Promise<void> {
        this.isRunning = false;

        // Stop update processing
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }

        // Flush remaining updates
        if (this.updateQueue.length > 0) {
            await this.flushUpdateQueue();
        }

        // Shutdown services
        await Promise.all([
            this.syncService.shutdown(),
            this.redisManager.shutdown()
        ]);

        // Clear subscriptions
        this.playerSubscriptions.clear();
        this.gameAdapters.clear();

        this.emit('shutdown');
        console.log('RealtimeAggregationService shutdown complete');
    }

    // Private methods

    private setupEventHandlers(): void {
        this.syncService.on('dataUpdated', (update: GameDataUpdate) => {
            this.emit('dataUpdated', update);
        });

        this.syncService.on('error', (error: Error) => {
            this.emit('error', error);
        });

        this.redisManager.on('error', (error: any) => {
            this.emit('error', error);
        });
    }

    private setupAdapterEventHandlers(adapter: GameAdapter): void {
        // Set up event handlers if adapter supports events
        if ('on' in adapter && typeof adapter.on === 'function') {
            (adapter as any).on('error', (error: GameHubError) => {
                console.error(`Game adapter error for ${adapter.gameId}:`, error);
                this.emit('adapterError', { gameId: adapter.gameId, error });
            });

            (adapter as any).on('disconnected', () => {
                console.warn(`Game adapter ${adapter.gameId} disconnected`);
                this.emit('adapterDisconnected', { gameId: adapter.gameId });
            });
        }
    }

    private startUpdateProcessing(): void {
        // Set up periodic flush of update queue
        this.flushTimer = setInterval(async () => {
            if (this.updateQueue.length > 0) {
                await this.flushUpdateQueue();
            }
        }, this.config.aggregation.flushInterval);
    }

    private async flushUpdateQueue(): Promise<void> {
        if (this.updateQueue.length === 0) {
            return;
        }

        const updates = [...this.updateQueue];
        this.updateQueue = [];

        try {
            // Process updates in parallel
            await Promise.all(
                updates.map(update => this.publishUpdate(update))
            );
            
            console.log(`Processed ${updates.length} game data updates`);
        } catch (error) {
            console.error('Failed to flush update queue:', error);
            // Re-add failed updates to queue for retry
            this.updateQueue.unshift(...updates);
        }
    }

    private async publishUpdate(update: GameDataUpdate): Promise<void> {
        try {
            // Publish through sync service
            await this.syncService.publishGameDataUpdate(update);
            
            // Also publish through Redis for additional subscribers
            await this.redisManager.publishPlayerUpdate(
                update.playerId,
                update.gameId,
                update.data,
                update.updateType
            );
            
        } catch (error) {
            console.error(`Failed to publish update for ${update.playerId}/${update.gameId}:`, error);
            throw error;
        }
    }

    private async validateGameData(data: StandardizedGameData): Promise<ValidationResult> {
        const startTime = Date.now();
        
        try {
            const result = await this.validationService.validateGameData(data);
            
            // Update validation time metric
            const validationTime = Date.now() - startTime;
            this.updateAverageMetric('averageValidationTime', validationTime);
            
            return result;
        } catch (error) {
            console.error('Validation failed:', error);
            return {
                isValid: false,
                score: 0,
                errors: [{
                    code: 'VALIDATION_ERROR',
                    message: `Validation process failed: ${error instanceof Error ? error.message : String(error)}`,
                    severity: 'CRITICAL'
                }],
                warnings: [],
                metadata: {
                    validatedAt: startTime,
                    validationDuration: Date.now() - startTime,
                    dataAge: Date.now() - data.lastUpdated,
                    checksPerformed: []
                }
            };
        }
    }

    private determineUpdateType(data: StandardizedGameData): 'ASSET_CHANGE' | 'ACHIEVEMENT_EARNED' | 'STATS_UPDATE' | 'FULL_SYNC' {
        // Simple heuristic - in a real implementation, this would compare with previous data
        if (data.achievements && data.achievements.length > 0) {
            const recentAchievements = data.achievements.filter(
                a => Date.now() - a.earnedAt < 60000 // Within last minute
            );
            if (recentAchievements.length > 0) {
                return 'ACHIEVEMENT_EARNED';
            }
        }

        if (data.assets && data.assets.length > 0) {
            return 'ASSET_CHANGE';
        }

        if (data.statistics) {
            return 'STATS_UPDATE';
        }

        return 'FULL_SYNC';
    }

    private updateAverageMetric(metricName: keyof AggregationMetrics, newValue: number): void {
        const currentAverage = this.metrics[metricName] as number;
        const totalUpdates = this.metrics.totalUpdates;
        
        if (totalUpdates === 0) {
            (this.metrics[metricName] as number) = newValue;
        } else {
            (this.metrics[metricName] as number) = (currentAverage * (totalUpdates - 1) + newValue) / totalUpdates;
        }
    }

    private updateCacheHitRate(hit: boolean): void {
        const totalRequests = this.metrics.totalUpdates;
        const currentHitRate = this.metrics.cacheHitRate;
        
        if (totalRequests === 0) {
            this.metrics.cacheHitRate = hit ? 1 : 0;
        } else {
            const currentHits = currentHitRate * totalRequests;
            const newHits = currentHits + (hit ? 1 : 0);
            this.metrics.cacheHitRate = newHits / (totalRequests + 1);
        }
    }
}