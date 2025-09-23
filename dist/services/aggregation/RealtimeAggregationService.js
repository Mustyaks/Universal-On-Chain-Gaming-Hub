"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeAggregationService = void 0;
const events_1 = require("events");
const RealtimeSyncService_1 = require("./RealtimeSyncService");
const RedisEventManager_1 = require("./RedisEventManager");
const DataValidationService_1 = require("./DataValidationService");
class RealtimeAggregationService extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.gameAdapters = new Map();
        this.playerSubscriptions = new Map();
        this.updateQueue = [];
        this.flushTimer = null;
        this.isRunning = false;
        this.config = config;
        this.syncService = new RealtimeSyncService_1.RealtimeSyncService(config.sync);
        this.redisManager = new RedisEventManager_1.RedisEventManager(config.redis);
        this.validationService = new DataValidationService_1.DataValidationService(config.validation);
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
    async initialize() {
        try {
            await Promise.all([
                this.syncService.initialize(),
                this.redisManager.initialize()
            ]);
            this.startUpdateProcessing();
            this.isRunning = true;
            this.emit('initialized');
            console.log('RealtimeAggregationService initialized successfully');
        }
        catch (error) {
            console.error('Failed to initialize RealtimeAggregationService:', error);
            throw error;
        }
    }
    async registerGameAdapter(adapter) {
        if (this.gameAdapters.has(adapter.gameId)) {
            throw new Error(`Game adapter for ${adapter.gameId} already registered`);
        }
        await this.syncService.registerGameAdapter(adapter);
        this.gameAdapters.set(adapter.gameId, adapter);
        this.setupAdapterEventHandlers(adapter);
        console.log(`Registered game adapter: ${adapter.gameId}`);
        this.emit('adapterRegistered', { gameId: adapter.gameId });
    }
    async subscribeToPlayer(playerId, callback, gameIds) {
        const subscription = {
            playerId,
            gameIds: new Set(gameIds || Array.from(this.gameAdapters.keys())),
            callback,
            subscribedAt: Date.now()
        };
        this.playerSubscriptions.set(playerId, subscription);
        await this.redisManager.subscribeToChannel(`player:${playerId}:updates`, (data) => {
            if (subscription.gameIds.has(data.gameId)) {
                callback(data);
            }
        });
        for (const gameId of subscription.gameIds) {
            const adapter = this.gameAdapters.get(gameId);
            if (adapter) {
                if ('subscribeToPlayerUpdates' in adapter && typeof adapter.subscribeToPlayerUpdates === 'function') {
                    await adapter.subscribeToPlayerUpdates(playerId);
                }
            }
        }
        this.metrics.activeSubscriptions = this.playerSubscriptions.size;
        console.log(`Subscribed to player ${playerId} updates for games: ${Array.from(subscription.gameIds).join(', ')}`);
        this.emit('playerSubscribed', { playerId, gameIds: Array.from(subscription.gameIds) });
    }
    async unsubscribeFromPlayer(playerId) {
        const subscription = this.playerSubscriptions.get(playerId);
        if (!subscription) {
            return;
        }
        await this.redisManager.unsubscribeFromChannel(`player:${playerId}:updates`);
        for (const gameId of subscription.gameIds) {
            const adapter = this.gameAdapters.get(gameId);
            if (adapter) {
                if ('unsubscribeFromPlayerUpdates' in adapter && typeof adapter.unsubscribeFromPlayerUpdates === 'function') {
                    await adapter.unsubscribeFromPlayerUpdates(playerId);
                }
            }
        }
        this.playerSubscriptions.delete(playerId);
        this.metrics.activeSubscriptions = this.playerSubscriptions.size;
        console.log(`Unsubscribed from player ${playerId} updates`);
        this.emit('playerUnsubscribed', { playerId });
    }
    async processGameDataUpdate(playerId, gameId, data, source = 'WEBSOCKET') {
        const startTime = Date.now();
        try {
            const validation = await this.validateGameData(data);
            if (!validation.isValid) {
                this.metrics.invalidUpdates++;
                console.warn(`Invalid game data for ${playerId}/${gameId}:`, validation.errors);
                this.emit('validationFailed', { playerId, gameId, validation });
                return;
            }
            const update = {
                playerId,
                gameId,
                updateType: this.determineUpdateType(data),
                data,
                timestamp: Date.now(),
                source
            };
            this.updateQueue.push(update);
            if (this.updateQueue.length >= this.config.aggregation.batchSize) {
                await this.flushUpdateQueue();
            }
            this.metrics.totalUpdates++;
            this.metrics.validUpdates++;
            const processingTime = Date.now() - startTime;
            this.updateAverageMetric('averageProcessingTime', processingTime);
        }
        catch (error) {
            this.metrics.invalidUpdates++;
            console.error(`Failed to process game data update for ${playerId}/${gameId}:`, error);
            this.emit('processingError', { playerId, gameId, error });
        }
    }
    async getCachedGameData(playerId, gameId) {
        try {
            const cached = await this.redisManager.getCachedGameData(playerId, gameId);
            if (cached) {
                this.updateCacheHitRate(true);
                return cached;
            }
            else {
                this.updateCacheHitRate(false);
                return null;
            }
        }
        catch (error) {
            console.error(`Failed to get cached data for ${playerId}/${gameId}:`, error);
            this.updateCacheHitRate(false);
            return null;
        }
    }
    getMetrics() {
        return { ...this.metrics };
    }
    async getHealthStatus() {
        const [syncHealth, redisHealth] = await Promise.all([
            this.syncService.getHealthStatus(),
            this.redisManager.isHealthy()
        ]);
        const services = {
            sync: syncHealth.healthy,
            redis: redisHealth,
            validation: true,
            aggregation: this.isRunning
        };
        const healthy = Object.values(services).every(status => status);
        return {
            healthy,
            services,
            metrics: this.getMetrics()
        };
    }
    async shutdown() {
        this.isRunning = false;
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.updateQueue.length > 0) {
            await this.flushUpdateQueue();
        }
        await Promise.all([
            this.syncService.shutdown(),
            this.redisManager.shutdown()
        ]);
        this.playerSubscriptions.clear();
        this.gameAdapters.clear();
        this.emit('shutdown');
        console.log('RealtimeAggregationService shutdown complete');
    }
    setupEventHandlers() {
        this.syncService.on('dataUpdated', (update) => {
            this.emit('dataUpdated', update);
        });
        this.syncService.on('error', (error) => {
            this.emit('error', error);
        });
        this.redisManager.on('error', (error) => {
            this.emit('error', error);
        });
    }
    setupAdapterEventHandlers(adapter) {
        if ('on' in adapter && typeof adapter.on === 'function') {
            adapter.on('error', (error) => {
                console.error(`Game adapter error for ${adapter.gameId}:`, error);
                this.emit('adapterError', { gameId: adapter.gameId, error });
            });
            adapter.on('disconnected', () => {
                console.warn(`Game adapter ${adapter.gameId} disconnected`);
                this.emit('adapterDisconnected', { gameId: adapter.gameId });
            });
        }
    }
    startUpdateProcessing() {
        this.flushTimer = setInterval(async () => {
            if (this.updateQueue.length > 0) {
                await this.flushUpdateQueue();
            }
        }, this.config.aggregation.flushInterval);
    }
    async flushUpdateQueue() {
        if (this.updateQueue.length === 0) {
            return;
        }
        const updates = [...this.updateQueue];
        this.updateQueue = [];
        try {
            await Promise.all(updates.map(update => this.publishUpdate(update)));
            console.log(`Processed ${updates.length} game data updates`);
        }
        catch (error) {
            console.error('Failed to flush update queue:', error);
            this.updateQueue.unshift(...updates);
        }
    }
    async publishUpdate(update) {
        try {
            await this.syncService.publishGameDataUpdate(update);
            await this.redisManager.publishPlayerUpdate(update.playerId, update.gameId, update.data, update.updateType);
        }
        catch (error) {
            console.error(`Failed to publish update for ${update.playerId}/${update.gameId}:`, error);
            throw error;
        }
    }
    async validateGameData(data) {
        const startTime = Date.now();
        try {
            const result = await this.validationService.validateGameData(data);
            const validationTime = Date.now() - startTime;
            this.updateAverageMetric('averageValidationTime', validationTime);
            return result;
        }
        catch (error) {
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
    determineUpdateType(data) {
        if (data.achievements && data.achievements.length > 0) {
            const recentAchievements = data.achievements.filter(a => Date.now() - a.earnedAt < 60000);
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
    updateAverageMetric(metricName, newValue) {
        const currentAverage = this.metrics[metricName];
        const totalUpdates = this.metrics.totalUpdates;
        if (totalUpdates === 0) {
            this.metrics[metricName] = newValue;
        }
        else {
            this.metrics[metricName] = (currentAverage * (totalUpdates - 1) + newValue) / totalUpdates;
        }
    }
    updateCacheHitRate(hit) {
        const totalRequests = this.metrics.totalUpdates;
        const currentHitRate = this.metrics.cacheHitRate;
        if (totalRequests === 0) {
            this.metrics.cacheHitRate = hit ? 1 : 0;
        }
        else {
            const currentHits = currentHitRate * totalRequests;
            const newHits = currentHits + (hit ? 1 : 0);
            this.metrics.cacheHitRate = newHits / (totalRequests + 1);
        }
    }
}
exports.RealtimeAggregationService = RealtimeAggregationService;
//# sourceMappingURL=RealtimeAggregationService.js.map