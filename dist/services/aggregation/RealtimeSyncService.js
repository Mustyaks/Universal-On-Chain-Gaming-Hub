"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeSyncService = void 0;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const redis_1 = require("redis");
class RealtimeSyncService extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.wsServer = null;
        this.gameAdapters = new Map();
        this.activeConnections = new Map();
        this.isRunning = false;
        this.config = config;
        this.redisClient = (0, redis_1.createClient)({ url: config.redis.url });
        this.redisSubscriber = (0, redis_1.createClient)({ url: config.redis.url });
        this.setupErrorHandlers();
    }
    async initialize() {
        try {
            await this.redisClient.connect();
            await this.redisSubscriber.connect();
            await this.setupRedisPubSub();
            this.setupWebSocketServer();
            this.isRunning = true;
            this.emit('initialized');
            console.log('RealtimeSyncService initialized successfully');
        }
        catch (error) {
            console.error('Failed to initialize RealtimeSyncService:', error);
            throw error;
        }
    }
    async registerGameAdapter(adapter) {
        if (this.gameAdapters.has(adapter.gameId)) {
            throw new Error(`Game adapter for ${adapter.gameId} already registered`);
        }
        this.gameAdapters.set(adapter.gameId, adapter);
        await adapter.subscribeToUpdates(async (data) => {
            await this.handleGameDataUpdate(data, 'WEBSOCKET');
        });
        console.log(`Registered game adapter for ${adapter.gameId}`);
    }
    async subscribeToPlayerUpdates(playerId, callback) {
        const channel = this.getPlayerChannel(playerId);
        await this.redisSubscriber.subscribe(channel, (message) => {
            try {
                const update = JSON.parse(message);
                callback(update);
            }
            catch (error) {
                console.error('Failed to parse Redis message:', error);
            }
        });
    }
    async unsubscribeFromPlayerUpdates(playerId) {
        const channel = this.getPlayerChannel(playerId);
        await this.redisSubscriber.unsubscribe(channel);
    }
    async publishGameDataUpdate(update) {
        const validation = await this.validateGameData(update.data);
        if (!validation.isValid) {
            throw new Error(`Invalid game data: ${validation.errors.join(', ')}`);
        }
        await this.cacheGameData(update);
        const channel = this.getPlayerChannel(update.playerId);
        await this.redisClient.publish(channel, JSON.stringify(update));
        this.broadcastToWebSocketClients(update);
        this.emit('dataUpdated', update);
    }
    async getCachedGameData(playerId, gameId) {
        const key = this.getGameDataKey(playerId, gameId);
        const cached = await this.redisClient.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        return null;
    }
    async validateGameData(data) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };
        if (!this.config.validation.enableIntegrityChecks) {
            return result;
        }
        for (const field of this.config.validation.requiredFields) {
            if (!this.hasNestedProperty(data, field)) {
                result.errors.push(`Missing required field: ${field}`);
                result.isValid = false;
            }
        }
        const dataAge = Date.now() - data.lastUpdated;
        if (dataAge > this.config.validation.maxDataAge) {
            result.warnings.push(`Data is ${dataAge}ms old, exceeds max age of ${this.config.validation.maxDataAge}ms`);
        }
        if (!data.playerId || typeof data.playerId !== 'string') {
            result.errors.push('Invalid playerId');
            result.isValid = false;
        }
        if (!data.gameId || typeof data.gameId !== 'string') {
            result.errors.push('Invalid gameId');
            result.isValid = false;
        }
        if (data.assets) {
            for (let i = 0; i < data.assets.length; i++) {
                const asset = data.assets[i];
                if (!asset || !asset.id || !asset.contractAddress || !asset.owner) {
                    result.errors.push(`Invalid asset at index ${i}: missing required fields`);
                    result.isValid = false;
                }
            }
        }
        if (data.achievements) {
            for (let i = 0; i < data.achievements.length; i++) {
                const achievement = data.achievements[i];
                if (!achievement || !achievement.id || !achievement.title || !achievement.earnedAt) {
                    result.errors.push(`Invalid achievement at index ${i}: missing required fields`);
                    result.isValid = false;
                }
            }
        }
        return result;
    }
    async shutdown() {
        this.isRunning = false;
        if (this.wsServer) {
            this.wsServer.close();
        }
        for (const adapter of this.gameAdapters.values()) {
            await adapter.unsubscribeFromUpdates();
        }
        await this.redisClient.quit();
        await this.redisSubscriber.quit();
        this.emit('shutdown');
        console.log('RealtimeSyncService shutdown complete');
    }
    async getHealthStatus() {
        const details = {
            isRunning: this.isRunning,
            activeConnections: this.activeConnections.size,
            registeredGames: this.gameAdapters.size,
            redisConnected: this.redisClient.isReady,
            wsServerRunning: this.wsServer !== null
        };
        const healthy = this.isRunning &&
            this.redisClient.isReady &&
            this.wsServer !== null;
        return { healthy, details };
    }
    setupErrorHandlers() {
        this.redisClient.on('error', (error) => {
            console.error('Redis client error:', error);
            this.emit('error', error);
        });
        this.redisSubscriber.on('error', (error) => {
            console.error('Redis subscriber error:', error);
            this.emit('error', error);
        });
    }
    async setupRedisPubSub() {
        const pattern = `${this.config.redis.keyPrefix}:player:*:updates`;
        await this.redisSubscriber.pSubscribe(pattern, (message, channel) => {
            this.emit('redisMessage', { channel, message });
        });
    }
    setupWebSocketServer() {
        this.wsServer = new ws_1.default.Server({
            port: this.config.websocket.port,
            maxPayload: 1024 * 1024
        });
        this.wsServer.on('connection', (ws, request) => {
            const connectionId = this.generateConnectionId();
            this.activeConnections.set(connectionId, ws);
            console.log(`WebSocket connection established: ${connectionId}`);
            const heartbeat = setInterval(() => {
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.ping();
                }
            }, this.config.websocket.heartbeatInterval);
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    await this.handleWebSocketMessage(ws, message);
                }
                catch (error) {
                    console.error('Failed to handle WebSocket message:', error);
                    ws.send(JSON.stringify({ error: 'Invalid message format' }));
                }
            });
            ws.on('close', () => {
                clearInterval(heartbeat);
                this.activeConnections.delete(connectionId);
                console.log(`WebSocket connection closed: ${connectionId}`);
            });
            ws.on('error', (error) => {
                console.error(`WebSocket error for connection ${connectionId}:`, error);
                clearInterval(heartbeat);
                this.activeConnections.delete(connectionId);
            });
        });
        console.log(`WebSocket server listening on port ${this.config.websocket.port}`);
    }
    async handleGameDataUpdate(data, source) {
        const update = {
            playerId: data.playerId,
            gameId: data.gameId,
            updateType: 'FULL_SYNC',
            data: data.normalizedData,
            timestamp: Date.now(),
            source
        };
        await this.publishGameDataUpdate(update);
    }
    async handleWebSocketMessage(ws, message) {
        switch (message.type) {
            case 'subscribe':
                if (message.playerId) {
                    await this.subscribeToPlayerUpdates(message.playerId, (update) => {
                        if (ws.readyState === ws_1.default.OPEN) {
                            ws.send(JSON.stringify({ type: 'update', data: update }));
                        }
                    });
                }
                break;
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;
            default:
                ws.send(JSON.stringify({ error: 'Unknown message type' }));
        }
    }
    async cacheGameData(update) {
        const key = this.getGameDataKey(update.playerId, update.gameId);
        const ttl = 3600;
        await this.redisClient.setEx(key, ttl, JSON.stringify(update.data));
    }
    broadcastToWebSocketClients(update) {
        const message = JSON.stringify({ type: 'update', data: update });
        for (const ws of this.activeConnections.values()) {
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(message);
            }
        }
    }
    getPlayerChannel(playerId) {
        return `${this.config.redis.keyPrefix}:player:${playerId}:updates`;
    }
    getGameDataKey(playerId, gameId) {
        return `${this.config.redis.keyPrefix}:gamedata:${playerId}:${gameId}`;
    }
    generateConnectionId() {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    hasNestedProperty(obj, path) {
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current === null || current === undefined || !(key in current)) {
                return false;
            }
            current = current[key];
        }
        return true;
    }
}
exports.RealtimeSyncService = RealtimeSyncService;
//# sourceMappingURL=RealtimeSyncService.js.map