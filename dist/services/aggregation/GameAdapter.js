"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseGameAdapter = void 0;
const WebSocketGameClient_1 = require("./WebSocketGameClient");
const events_1 = require("events");
class BaseGameAdapter extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.lastSyncTime = 0;
        this.isConnected = false;
        this.config = config;
        if (config.wsEndpoint) {
            this.initializeWebSocketClient();
        }
    }
    get gameId() {
        return this.config.gameId;
    }
    get gameName() {
        return this.config.gameName;
    }
    get version() {
        return '1.0.0';
    }
    get supportedFeatures() {
        return ['ASSETS', 'ACHIEVEMENTS', 'STATISTICS'];
    }
    async fetchPlayerData(playerId) {
        const rawData = await this.executeWithRetry(() => this.fetchRawPlayerData(playerId), `fetchPlayerData-${playerId}`);
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
    async subscribeToUpdates(callback) {
        this.updateCallback = callback;
        if (this.supportedFeatures.includes('REAL_TIME_UPDATES')) {
            if (this.wsClient) {
                await this.wsClient.connect();
                this.setupWebSocketEventHandlers();
            }
            else {
                await this.connectToGameNetwork();
            }
            this.isConnected = true;
        }
    }
    async unsubscribeFromUpdates() {
        this.updateCallback = undefined;
        if (this.isConnected) {
            if (this.wsClient) {
                await this.wsClient.disconnect();
            }
            else {
                await this.disconnectFromGameNetwork();
            }
            this.isConnected = false;
        }
    }
    async isHealthy() {
        try {
            await this.executeWithRetry(() => this.performHealthCheck(), 'health-check');
            return true;
        }
        catch (error) {
            return false;
        }
    }
    getLastSyncTime() {
        return this.lastSyncTime;
    }
    handleError(error) {
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
    async executeWithRetry(operation, operationName) {
        const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier } = this.config.retryConfig;
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxRetries) {
                    throw this.handleError(error);
                }
                const delay = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs);
                console.warn(`${this.gameName} adapter: ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`, error);
                await this.sleep(delay);
            }
        }
        throw this.handleError(lastError);
    }
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async performHealthCheck() {
        if (this.config.rpcEndpoint) {
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
    normalizeAssets(rawAssets) {
        return rawAssets.map(asset => this.normalizeAsset(asset));
    }
    normalizeAsset(rawAsset) {
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
            tradeable: rawAsset.tradeable !== false
        };
    }
    normalizeAchievements(rawAchievements) {
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
    normalizeStatistics(rawStats) {
        return {
            gameId: this.gameId,
            playerId: rawStats.player_id,
            playtime: rawStats.playtime || 0,
            level: rawStats.level || 1,
            score: rawStats.score || 0,
            customStats: rawStats.custom_stats || {}
        };
    }
    determineAssetType(rawAsset) {
        if (rawAsset.type)
            return rawAsset.type;
        if (rawAsset.token_id && rawAsset.contract_address)
            return 'NFT';
        if (rawAsset.fungible || rawAsset.is_currency)
            return 'CURRENCY';
        return 'ITEM';
    }
    determineRarity(rawAsset) {
        if (rawAsset.rarity)
            return rawAsset.rarity;
        const attributes = rawAsset.attributes || [];
        if (attributes.length > 5)
            return 'LEGENDARY';
        if (attributes.length > 3)
            return 'EPIC';
        if (attributes.length > 1)
            return 'RARE';
        return 'COMMON';
    }
    initializeWebSocketClient() {
        if (!this.config.wsEndpoint)
            return;
        const wsConfig = {
            gameId: this.gameId,
            wsEndpoint: this.config.wsEndpoint,
            reconnectInterval: 5000,
            maxReconnectAttempts: 10,
            heartbeatInterval: 30000,
            messageTimeout: 10000
        };
        this.wsClient = new WebSocketGameClient_1.WebSocketGameClient(wsConfig);
    }
    setupWebSocketEventHandlers() {
        if (!this.wsClient || !this.updateCallback)
            return;
        this.wsClient.on('playerUpdate', async (data) => {
            try {
                const playerData = await this.processWebSocketUpdate(data);
                if (playerData && this.updateCallback) {
                    this.updateCallback(playerData);
                }
            }
            catch (error) {
                console.error(`Failed to process WebSocket update for ${this.gameId}:`, error);
                this.emit('error', this.handleError(error));
            }
        });
        this.wsClient.on('assetChange', async (data) => {
            try {
                const playerData = await this.processAssetChange(data);
                if (playerData && this.updateCallback) {
                    this.updateCallback(playerData);
                }
            }
            catch (error) {
                console.error(`Failed to process asset change for ${this.gameId}:`, error);
                this.emit('error', this.handleError(error));
            }
        });
        this.wsClient.on('achievementEarned', async (data) => {
            try {
                const playerData = await this.processAchievementEarned(data);
                if (playerData && this.updateCallback) {
                    this.updateCallback(playerData);
                }
            }
            catch (error) {
                console.error(`Failed to process achievement earned for ${this.gameId}:`, error);
                this.emit('error', this.handleError(error));
            }
        });
        this.wsClient.on('error', (error) => {
            this.emit('error', error);
        });
        this.wsClient.on('disconnected', () => {
            this.isConnected = false;
            this.emit('disconnected');
        });
    }
    async processWebSocketUpdate(data) {
        if (!data.playerId || !data.data) {
            console.warn('Invalid WebSocket update data:', data);
            return null;
        }
        try {
            const normalizedData = await this.normalize(data.data);
            return {
                playerId: data.playerId,
                gameId: this.gameId,
                rawData: data.data,
                normalizedData,
                syncedAt: data.timestamp || Date.now()
            };
        }
        catch (error) {
            console.error('Failed to normalize WebSocket data:', error);
            return null;
        }
    }
    async processAssetChange(data) {
        if (!data.playerId || !data.assetData) {
            console.warn('Invalid asset change data:', data);
            return null;
        }
        try {
            const playerData = await this.fetchPlayerData(data.playerId);
            return playerData;
        }
        catch (error) {
            console.error('Failed to fetch player data after asset change:', error);
            return null;
        }
    }
    async processAchievementEarned(data) {
        if (!data.playerId || !data.achievement) {
            console.warn('Invalid achievement earned data:', data);
            return null;
        }
        try {
            const playerData = await this.fetchPlayerData(data.playerId);
            return playerData;
        }
        catch (error) {
            console.error('Failed to fetch player data after achievement earned:', error);
            return null;
        }
    }
    async subscribeToPlayerUpdates(playerId) {
        if (this.wsClient && this.wsClient.isClientConnected()) {
            await this.wsClient.subscribeToPlayer(playerId);
        }
    }
    async unsubscribeFromPlayerUpdates(playerId) {
        if (this.wsClient && this.wsClient.isClientConnected()) {
            await this.wsClient.unsubscribeFromPlayer(playerId);
        }
    }
    getWebSocketStatus() {
        if (!this.wsClient) {
            return null;
        }
        const status = this.wsClient.getConnectionStatus();
        return {
            connected: status.connected,
            subscribedPlayers: status.subscribedPlayers
        };
    }
}
exports.BaseGameAdapter = BaseGameAdapter;
//# sourceMappingURL=GameAdapter.js.map