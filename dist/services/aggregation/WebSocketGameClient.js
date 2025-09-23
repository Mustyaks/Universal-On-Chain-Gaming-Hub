"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketGameClient = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
class WebSocketGameClient extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        this.subscribedPlayers = new Set();
        this.config = config;
    }
    async connect() {
        if (this.isConnected) {
            return;
        }
        try {
            this.ws = new ws_1.default(this.config.wsEndpoint);
            this.ws.on('open', () => {
                this.handleConnection();
            });
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            this.ws.on('close', (code, reason) => {
                this.handleDisconnection(code, reason.toString());
            });
            this.ws.on('error', (error) => {
                this.handleError(error);
            });
            await this.waitForConnection();
        }
        catch (error) {
            console.error(`Failed to connect to ${this.config.gameId} WebSocket:`, error);
            throw error;
        }
    }
    async disconnect() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.subscribedPlayers.clear();
    }
    async subscribeToPlayer(playerId) {
        if (!this.isConnected) {
            throw new Error('WebSocket not connected');
        }
        if (this.subscribedPlayers.has(playerId)) {
            return;
        }
        const message = {
            type: 'SUBSCRIBE_PLAYER',
            playerId,
            timestamp: Date.now()
        };
        this.sendMessage(message);
        this.subscribedPlayers.add(playerId);
        console.log(`Subscribed to player ${playerId} updates for game ${this.config.gameId}`);
    }
    async unsubscribeFromPlayer(playerId) {
        if (!this.isConnected || !this.subscribedPlayers.has(playerId)) {
            return;
        }
        const message = {
            type: 'UNSUBSCRIBE_PLAYER',
            playerId,
            timestamp: Date.now()
        };
        this.sendMessage(message);
        this.subscribedPlayers.delete(playerId);
        console.log(`Unsubscribed from player ${playerId} updates for game ${this.config.gameId}`);
    }
    sendMessage(message) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            throw new Error('WebSocket not ready for sending messages');
        }
        this.ws.send(JSON.stringify(message));
    }
    isClientConnected() {
        return this.isConnected && this.ws?.readyState === ws_1.default.OPEN;
    }
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            gameId: this.config.gameId,
            subscribedPlayers: this.subscribedPlayers.size,
            reconnectAttempts: this.reconnectAttempts
        };
    }
    handleConnection() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log(`Connected to ${this.config.gameId} WebSocket`);
        this.startHeartbeat();
        if (this.subscribedPlayers.size > 0) {
            for (const playerId of this.subscribedPlayers) {
                this.subscribeToPlayer(playerId).catch(console.error);
            }
        }
        this.emit('connected');
    }
    handleDisconnection(code, reason) {
        this.isConnected = false;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        console.log(`Disconnected from ${this.config.gameId} WebSocket: ${code} - ${reason}`);
        this.emit('disconnected', { code, reason });
        if (code !== 1000 && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            switch (message.type) {
                case 'PLAYER_UPDATE':
                    this.handlePlayerUpdate(message);
                    break;
                case 'ASSET_CHANGE':
                    this.handleAssetChange(message);
                    break;
                case 'ACHIEVEMENT_EARNED':
                    this.handleAchievementEarned(message);
                    break;
                case 'HEARTBEAT':
                    this.sendMessage({ type: 'HEARTBEAT_ACK', timestamp: Date.now() });
                    break;
                case 'ERROR':
                    this.handleGameError(message);
                    break;
                default:
                    console.warn(`Unknown message type from ${this.config.gameId}:`, message.type);
            }
        }
        catch (error) {
            console.error(`Failed to parse message from ${this.config.gameId}:`, error);
        }
    }
    handlePlayerUpdate(message) {
        if (!message.playerId || !message.data) {
            console.warn('Invalid player update message:', message);
            return;
        }
        this.emit('playerUpdate', {
            playerId: message.playerId,
            gameId: this.config.gameId,
            data: message.data,
            timestamp: message.timestamp
        });
    }
    handleAssetChange(message) {
        if (!message.playerId || !message.data) {
            console.warn('Invalid asset change message:', message);
            return;
        }
        this.emit('assetChange', {
            playerId: message.playerId,
            gameId: this.config.gameId,
            assetData: message.data,
            timestamp: message.timestamp
        });
    }
    handleAchievementEarned(message) {
        if (!message.playerId || !message.data) {
            console.warn('Invalid achievement earned message:', message);
            return;
        }
        this.emit('achievementEarned', {
            playerId: message.playerId,
            gameId: this.config.gameId,
            achievement: message.data,
            timestamp: message.timestamp
        });
    }
    handleGameError(message) {
        const error = {
            code: 'EXTERNAL_SERVICE_ERROR',
            message: `Game ${this.config.gameId} reported error: ${message.data?.message || 'Unknown error'}`,
            details: {
                gameId: this.config.gameId,
                originalError: message.data
            },
            timestamp: message.timestamp
        };
        this.emit('gameError', error);
    }
    handleError(error) {
        console.error(`WebSocket error for ${this.config.gameId}:`, error);
        const gameError = {
            code: 'NETWORK_ERROR',
            message: `WebSocket connection error for ${this.config.gameId}: ${error.message}`,
            details: {
                gameId: this.config.gameId,
                originalError: error
            },
            timestamp: Date.now()
        };
        this.emit('error', gameError);
    }
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.ws?.readyState === ws_1.default.OPEN) {
                this.sendMessage({ type: 'PING', timestamp: Date.now() });
            }
        }, this.config.heartbeatInterval);
    }
    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1), 30000);
        console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} for ${this.config.gameId} in ${delay}ms`);
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch((error) => {
                console.error(`Reconnect attempt ${this.reconnectAttempts} failed for ${this.config.gameId}:`, error);
            });
        }, delay);
    }
    async waitForConnection() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Connection timeout for ${this.config.gameId}`));
            }, this.config.messageTimeout);
            const onConnect = () => {
                clearTimeout(timeout);
                this.off('error', onError);
                resolve();
            };
            const onError = (error) => {
                clearTimeout(timeout);
                this.off('connected', onConnect);
                reject(error);
            };
            this.once('connected', onConnect);
            this.once('error', onError);
        });
    }
}
exports.WebSocketGameClient = WebSocketGameClient;
//# sourceMappingURL=WebSocketGameClient.js.map