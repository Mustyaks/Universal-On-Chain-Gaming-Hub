"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncEngine = void 0;
const events_1 = require("events");
const ErrorHandler_1 = require("./ErrorHandler");
class SyncEngine extends events_1.EventEmitter {
    constructor(config, adapterRegistry) {
        super();
        this.syncStatuses = new Map();
        this.updateQueue = new Map();
        this.batchProcessor = null;
        this.isRunning = false;
        this.config = config;
        this.adapterRegistry = adapterRegistry;
        this.circuitBreaker = new ErrorHandler_1.CircuitBreaker({
            failureThreshold: 5,
            resetTimeoutMs: 60000
        });
    }
    async initialize() {
        try {
            await this.initializeRedis();
            await this.setupEventListeners();
            await this.startBatchProcessor();
            this.isRunning = true;
            console.log('Sync engine initialized successfully');
            this.emit('sync_engine:initialized');
        }
        catch (error) {
            console.error('Failed to initialize sync engine:', error);
            throw error;
        }
    }
    async startGameSync(gameId) {
        const adapter = this.adapterRegistry.getAdapter(gameId);
        if (!adapter) {
            throw new Error(`No adapter found for game: ${gameId}`);
        }
        if (this.syncStatuses.has(gameId)) {
            throw new Error(`Sync already started for game: ${gameId}`);
        }
        try {
            const status = {
                gameId,
                isConnected: false,
                lastSyncTime: 0,
                pendingUpdates: 0,
                errorCount: 0
            };
            this.syncStatuses.set(gameId, status);
            this.updateQueue.set(gameId, []);
            await adapter.subscribeToUpdates((data) => {
                this.handlePlayerUpdate(data);
            });
            status.isConnected = true;
            status.lastSyncTime = Date.now();
            console.log(`Started sync for game: ${gameId}`);
            this.emit('game_sync:started', { gameId });
        }
        catch (error) {
            this.handleSyncError(gameId, error);
            throw error;
        }
    }
    async stopGameSync(gameId) {
        const adapter = this.adapterRegistry.getAdapter(gameId);
        const status = this.syncStatuses.get(gameId);
        if (!status) {
            return;
        }
        try {
            if (adapter) {
                await adapter.unsubscribeFromUpdates();
            }
            await this.processPendingUpdates(gameId);
            this.syncStatuses.delete(gameId);
            this.updateQueue.delete(gameId);
            console.log(`Stopped sync for game: ${gameId}`);
            this.emit('game_sync:stopped', { gameId });
        }
        catch (error) {
            console.error(`Error stopping sync for game ${gameId}:`, error);
        }
    }
    getSyncStatuses() {
        return Array.from(this.syncStatuses.values());
    }
    getSyncStatus(gameId) {
        return this.syncStatuses.get(gameId) || null;
    }
    async syncPlayer(playerId) {
        const adapters = this.adapterRegistry.getAllAdapters();
        const results = [];
        for (const adapter of adapters) {
            try {
                const playerData = await this.circuitBreaker.execute(() => adapter.fetchPlayerData(playerId), `sync-player-${adapter.gameId}`);
                results.push(playerData.normalizedData);
                this.emitSyncEvent({
                    type: 'player_update',
                    gameId: adapter.gameId,
                    playerId,
                    data: playerData.normalizedData,
                    timestamp: Date.now()
                });
            }
            catch (error) {
                this.handleSyncError(adapter.gameId, error);
            }
        }
        return results;
    }
    async validatePlayerData(data) {
        if (!this.config.sync.validationEnabled) {
            return true;
        }
        try {
            if (!data.playerId || !data.gameId || !data.normalizedData) {
                return false;
            }
            if (data.syncedAt > Date.now() + 60000) {
                return false;
            }
            if (data.normalizedData.assets) {
                const adapter = this.adapterRegistry.getAdapter(data.gameId);
                if (adapter) {
                    for (const asset of data.normalizedData.assets) {
                        const isValid = await adapter.validateAsset(asset);
                        if (!isValid) {
                            console.warn(`Invalid asset detected: ${asset.id} for player ${data.playerId}`);
                            return false;
                        }
                    }
                }
            }
            return true;
        }
        catch (error) {
            console.error('Data validation error:', error);
            return false;
        }
    }
    async shutdown() {
        this.isRunning = false;
        const gameIds = Array.from(this.syncStatuses.keys());
        for (const gameId of gameIds) {
            await this.stopGameSync(gameId);
        }
        if (this.batchProcessor) {
            clearInterval(this.batchProcessor);
            this.batchProcessor = null;
        }
        if (this.redisClient) {
            await this.redisClient.quit();
        }
        if (this.redisPub) {
            await this.redisPub.quit();
        }
        if (this.redisSub) {
            await this.redisSub.quit();
        }
        console.log('Sync engine shutdown complete');
        this.emit('sync_engine:shutdown');
    }
    async initializeRedis() {
        const redisConfig = {
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password,
            db: this.config.redis.db
        };
        this.redisClient = {
            publish: async (channel, message) => {
                console.log(`Redis publish to ${channel}:`, message);
            },
            subscribe: async (channel) => {
                console.log(`Redis subscribe to ${channel}`);
            },
            quit: async () => {
                console.log('Redis client disconnected');
            }
        };
        this.redisPub = this.redisClient;
        this.redisSub = this.redisClient;
        this.setupRedisMessageHandling();
    }
    setupRedisMessageHandling() {
        const handleMessage = (channel, message) => {
            try {
                const syncEvent = JSON.parse(message);
                this.emit('sync_event', syncEvent);
                const status = this.syncStatuses.get(syncEvent.gameId);
                if (status) {
                    status.lastSyncTime = syncEvent.timestamp;
                }
            }
            catch (error) {
                console.error('Error handling Redis message:', error);
            }
        };
        this.redisSub.subscribe('game_updates');
        this.redisSub.subscribe('player_updates');
        this.redisSub.subscribe('asset_updates');
    }
    async setupEventListeners() {
        this.adapterRegistry.eventService.on('adapter:registered', ({ gameId }) => {
            console.log(`Adapter registered for ${gameId}, starting sync...`);
            this.startGameSync(gameId).catch(error => {
                console.error(`Failed to start sync for ${gameId}:`, error);
            });
        });
        this.adapterRegistry.eventService.on('adapter:unregistered', ({ gameId }) => {
            console.log(`Adapter unregistered for ${gameId}, stopping sync...`);
            this.stopGameSync(gameId).catch(error => {
                console.error(`Failed to stop sync for ${gameId}:`, error);
            });
        });
        this.adapterRegistry.eventService.on('adapter:error', ({ gameId, error }) => {
            this.handleSyncError(gameId, error);
        });
    }
    async startBatchProcessor() {
        this.batchProcessor = setInterval(() => this.processBatchUpdates(), this.config.sync.batchIntervalMs);
    }
    async processBatchUpdates() {
        if (!this.isRunning)
            return;
        for (const [gameId, updates] of this.updateQueue.entries()) {
            if (updates.length === 0)
                continue;
            try {
                const batchSize = this.config.sync.batchSize;
                const batches = this.chunkArray(updates, batchSize);
                for (const batch of batches) {
                    await this.processBatch(gameId, batch);
                }
                this.updateQueue.set(gameId, []);
                const status = this.syncStatuses.get(gameId);
                if (status) {
                    status.pendingUpdates = 0;
                    status.lastSyncTime = Date.now();
                }
            }
            catch (error) {
                this.handleSyncError(gameId, error);
            }
        }
    }
    async processBatch(gameId, batch) {
        for (const update of batch) {
            try {
                const isValid = await this.validatePlayerData(update);
                if (!isValid) {
                    console.warn(`Invalid data for player ${update.playerId} in game ${gameId}`);
                    continue;
                }
                await this.publishUpdate(update);
                this.emitSyncEvent({
                    type: 'player_update',
                    gameId: update.gameId,
                    playerId: update.playerId,
                    data: update.normalizedData,
                    timestamp: update.syncedAt
                });
            }
            catch (error) {
                console.error(`Error processing update for player ${update.playerId}:`, error);
            }
        }
    }
    async processPendingUpdates(gameId) {
        const updates = this.updateQueue.get(gameId) || [];
        if (updates.length > 0) {
            await this.processBatch(gameId, updates);
        }
    }
    async publishUpdate(update) {
        const message = JSON.stringify({
            type: 'player_update',
            gameId: update.gameId,
            playerId: update.playerId,
            data: update.normalizedData,
            timestamp: update.syncedAt
        });
        await this.redisPub.publish('player_updates', message);
    }
    handlePlayerUpdate(data) {
        const queue = this.updateQueue.get(data.gameId) || [];
        queue.push(data);
        this.updateQueue.set(data.gameId, queue);
        const status = this.syncStatuses.get(data.gameId);
        if (status) {
            status.pendingUpdates = queue.length;
        }
    }
    handleSyncError(gameId, error) {
        const gameError = ErrorHandler_1.ErrorHandler.classifyError(error);
        const status = this.syncStatuses.get(gameId);
        if (status) {
            status.errorCount++;
            status.lastError = gameError;
        }
        console.error(`Sync error for game ${gameId}:`, gameError);
        this.emitSyncEvent({
            type: 'sync_error',
            gameId,
            playerId: '',
            data: gameError,
            timestamp: Date.now()
        });
    }
    emitSyncEvent(event) {
        this.emit('sync_event', event);
    }
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
}
exports.SyncEngine = SyncEngine;
//# sourceMappingURL=SyncEngine.js.map