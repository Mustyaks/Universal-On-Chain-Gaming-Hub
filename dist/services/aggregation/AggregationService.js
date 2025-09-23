"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregationService = void 0;
const events_1 = require("events");
const AdapterRegistry_1 = require("./AdapterRegistry");
const SyncEngine_1 = require("./SyncEngine");
const DataValidator_1 = require("./DataValidator");
const EventSystem_1 = require("./EventSystem");
const CacheManager_1 = require("./CacheManager");
const PerformanceMonitor_1 = require("./PerformanceMonitor");
const ErrorHandler_1 = require("./ErrorHandler");
class AggregationService extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.cacheManager = null;
        this.performanceMonitor = null;
        this.isInitialized = false;
        this.isRunning = false;
        this.config = config;
        this.eventSystem = new EventSystem_1.EventSystem();
        this.adapterRegistry = new AdapterRegistry_1.AdapterRegistry(this.eventSystem);
        this.syncEngine = new SyncEngine_1.SyncEngine(config.sync, this.adapterRegistry);
        this.dataValidator = new DataValidator_1.DataValidator(this.adapterRegistry, config.validation);
        if (config.enableCaching) {
            this.cacheManager = new CacheManager_1.CacheManager(config.cache);
        }
        if (config.enablePerformanceMonitoring) {
            this.performanceMonitor = new PerformanceMonitor_1.PerformanceMonitor(config.performance);
        }
        this.setupEventHandlers();
    }
    async initialize() {
        if (this.isInitialized) {
            throw new Error('Aggregation service is already initialized');
        }
        try {
            console.log('Initializing aggregation service...');
            if (this.cacheManager) {
                await this.cacheManager.initialize();
            }
            await this.syncEngine.initialize();
            if (this.performanceMonitor) {
                this.performanceMonitor.start();
            }
            this.isInitialized = true;
            this.isRunning = true;
            console.log('Aggregation service initialized successfully');
            this.emit('service:initialized');
        }
        catch (error) {
            console.error('Failed to initialize aggregation service:', error);
            throw error;
        }
    }
    async registerGame(adapter) {
        if (!this.isInitialized) {
            throw new Error('Service must be initialized before registering games');
        }
        try {
            const config = {
                gameId: adapter.gameId,
                gameName: adapter.gameName,
                contractAddress: '',
                rpcEndpoint: '',
                retryConfig: {
                    maxRetries: 3,
                    baseDelayMs: 1000,
                    maxDelayMs: 30000,
                    backoffMultiplier: 2
                },
                cacheConfig: {
                    ttlSeconds: 300,
                    maxEntries: 1000,
                    enableCache: this.config.enableCaching
                }
            };
            await this.adapterRegistry.registerAdapter(adapter, config);
            if (this.config.enableRealTimeSync) {
                await this.syncEngine.startGameSync(adapter.gameId);
            }
            console.log(`Game registered: ${adapter.gameId} (${adapter.gameName})`);
            this.emit('game:registered', { gameId: adapter.gameId, gameName: adapter.gameName });
        }
        catch (error) {
            const gameError = ErrorHandler_1.ErrorHandler.classifyError(error);
            console.error(`Failed to register game ${adapter.gameId}:`, gameError);
            this.emit('game:registration_failed', { gameId: adapter.gameId, error: gameError });
            throw gameError;
        }
    }
    async syncPlayerData(playerId, gameId) {
        if (!this.isRunning) {
            throw new Error('Service is not running');
        }
        const startTime = Date.now();
        try {
            let results = [];
            if (gameId) {
                const adapter = this.adapterRegistry.getAdapter(gameId);
                if (!adapter) {
                    throw new Error(`No adapter found for game: ${gameId}`);
                }
                const playerData = await this.fetchAndValidatePlayerData(adapter, playerId);
                results = [playerData.normalizedData];
            }
            else {
                results = await this.syncEngine.syncPlayer(playerId);
            }
            if (this.cacheManager) {
                for (const data of results) {
                    await this.cacheManager.set({ type: 'player_data', gameId: data.gameId, playerId }, data);
                }
            }
            if (this.performanceMonitor) {
                const responseTime = Date.now() - startTime;
                this.performanceMonitor.recordApiRequest(responseTime, true);
            }
            await this.eventSystem.publishEvent({
                type: 'sync.completed',
                gameId: gameId || 'all',
                playerId,
                data: results,
                source: 'aggregation_service'
            });
            return results;
        }
        catch (error) {
            const gameError = ErrorHandler_1.ErrorHandler.classifyError(error);
            if (this.performanceMonitor) {
                const responseTime = Date.now() - startTime;
                this.performanceMonitor.recordApiRequest(responseTime, false);
            }
            await this.eventSystem.publishEvent({
                type: 'sync.failed',
                gameId: gameId || 'all',
                playerId,
                data: gameError,
                source: 'aggregation_service'
            });
            throw gameError;
        }
    }
    async getPlayerGameData(playerId, gameId) {
        if (!this.isRunning) {
            throw new Error('Service is not running');
        }
        const startTime = Date.now();
        try {
            if (this.cacheManager) {
                const cached = await this.cacheManager.get({
                    type: 'player_data',
                    gameId,
                    playerId
                });
                if (cached) {
                    if (this.performanceMonitor) {
                        const responseTime = Date.now() - startTime;
                        this.performanceMonitor.recordApiRequest(responseTime, true);
                    }
                    return cached;
                }
            }
            const adapter = this.adapterRegistry.getAdapter(gameId);
            if (!adapter) {
                throw new Error(`No adapter found for game: ${gameId}`);
            }
            const playerData = await this.fetchAndValidatePlayerData(adapter, playerId);
            if (this.cacheManager) {
                await this.cacheManager.set({ type: 'player_data', gameId, playerId }, playerData);
            }
            if (this.performanceMonitor) {
                const responseTime = Date.now() - startTime;
                this.performanceMonitor.recordApiRequest(responseTime, true);
            }
            return playerData;
        }
        catch (error) {
            const gameError = ErrorHandler_1.ErrorHandler.classifyError(error);
            if (this.performanceMonitor) {
                const responseTime = Date.now() - startTime;
                this.performanceMonitor.recordApiRequest(responseTime, false);
            }
            throw gameError;
        }
    }
    subscribeToPlayerUpdates(playerId, callback) {
        this.eventSystem.subscribe({
            eventTypes: ['player.updated', 'sync.completed'],
            playerIds: [playerId],
            callback: async (event) => {
                if (event.data && event.data.playerId === playerId) {
                    callback(event.data);
                }
            },
            priority: 1
        });
    }
    getStatus() {
        const syncStatuses = this.syncEngine.getSyncStatuses();
        const adapterInfo = this.adapterRegistry.getAllAdapterInfo();
        return {
            isRunning: this.isRunning,
            registeredGames: adapterInfo.length,
            activeSyncs: syncStatuses.filter(s => s.isConnected).length,
            cacheHitRate: this.cacheManager?.getMetrics().hitRate || 0,
            averageResponseTime: this.performanceMonitor?.getCurrentMetrics().api.averageResponseTime || 0,
            errorRate: this.performanceMonitor?.getCurrentMetrics().errors.errorRate || 0,
            lastSyncTime: Math.max(...syncStatuses.map(s => s.lastSyncTime), 0)
        };
    }
    getPerformanceMetrics() {
        if (!this.performanceMonitor) {
            return null;
        }
        return this.performanceMonitor.getCurrentMetrics();
    }
    getCacheMetrics() {
        if (!this.cacheManager) {
            return null;
        }
        return this.cacheManager.getMetrics();
    }
    async invalidatePlayerCache(playerId, gameId) {
        if (!this.cacheManager) {
            return;
        }
        if (gameId) {
            await this.cacheManager.invalidateByTrigger('player_update', { playerId, gameId });
        }
        else {
            await this.cacheManager.invalidateByTrigger('player_update', { playerId });
        }
    }
    async shutdown() {
        if (!this.isRunning) {
            return;
        }
        try {
            console.log('Shutting down aggregation service...');
            await this.syncEngine.shutdown();
            if (this.performanceMonitor) {
                this.performanceMonitor.stop();
            }
            if (this.cacheManager) {
                await this.cacheManager.shutdown();
            }
            await this.adapterRegistry.destroy();
            this.isRunning = false;
            console.log('Aggregation service shutdown complete');
            this.emit('service:shutdown');
        }
        catch (error) {
            console.error('Error during aggregation service shutdown:', error);
            throw error;
        }
    }
    async fetchAndValidatePlayerData(adapter, playerId) {
        const playerData = await adapter.fetchPlayerData(playerId);
        if (this.config.enableDataValidation) {
            const validationResult = await this.dataValidator.validatePlayerData(playerData);
            if (!validationResult.isValid) {
                const error = new Error(`Data validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
                await this.eventSystem.publishValidationFailed(adapter.gameId, playerId, validationResult);
                throw error;
            }
        }
        return playerData;
    }
    setupEventHandlers() {
        this.syncEngine.on('sync_event', (event) => {
            this.emit('sync:event', event);
            if (this.cacheManager && event.type === 'player_update') {
                this.cacheManager.invalidateByTrigger('player_update', {
                    playerId: event.playerId,
                    gameId: event.gameId
                });
            }
        });
        this.adapterRegistry.eventService.on('adapter:error', ({ gameId, error }) => {
            this.emit('adapter:error', { gameId, error });
            if (this.performanceMonitor) {
                this.performanceMonitor.recordError({
                    timestamp: Date.now(),
                    type: 'ADAPTER_ERROR',
                    message: error.message,
                    source: `adapter:${gameId}`,
                    severity: 'HIGH'
                });
            }
        });
        if (this.cacheManager) {
            this.cacheManager.on('cache:error', (event) => {
                this.emit('cache:error', event);
            });
        }
        if (this.performanceMonitor) {
            this.performanceMonitor.on('alert:created', (alert) => {
                this.emit('performance:alert', alert);
            });
        }
    }
}
exports.AggregationService = AggregationService;
//# sourceMappingURL=AggregationService.js.map