"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DojoGameAdapter = void 0;
const GameAdapter_1 = require("../GameAdapter");
class DojoGameAdapter extends GameAdapter_1.BaseGameAdapter {
    constructor(config) {
        super(config);
        this.wsConnection = null;
        this.dojoConfig = config;
    }
    get version() {
        return '1.0.0';
    }
    get supportedFeatures() {
        return [
            'ASSETS',
            'ACHIEVEMENTS',
            'STATISTICS',
            'REAL_TIME_UPDATES',
            'ASSET_TRADING'
        ];
    }
    async normalize(rawData) {
        const { player_id, assets, achievements, stats } = rawData;
        return {
            playerId: player_id,
            gameId: this.gameId,
            assets: this.normalizeAssets(assets || []),
            achievements: this.normalizeAchievements(achievements || []),
            statistics: this.normalizeStatistics(stats || {}),
            lastUpdated: Date.now()
        };
    }
    async fetchRawPlayerData(playerId) {
        const [playerData, assetData, achievementData] = await Promise.all([
            this.fetchPlayerInfo(playerId),
            this.fetchPlayerAssets(playerId),
            this.fetchPlayerAchievements(playerId)
        ]);
        return {
            player_id: playerId,
            player_info: playerData,
            assets: assetData,
            achievements: achievementData,
            stats: playerData.stats || {}
        };
    }
    async validateAsset(asset) {
        try {
            const onChainAsset = await this.fetchAssetFromContract(asset.tokenId);
            return (onChainAsset &&
                onChainAsset.owner === asset.owner &&
                onChainAsset.contract_address === asset.contractAddress);
        }
        catch (error) {
            console.error(`Asset validation failed for ${asset.id}:`, error);
            return false;
        }
    }
    async connectToGameNetwork() {
        if (!this.config.wsEndpoint) {
            throw new Error('WebSocket endpoint not configured');
        }
        return new Promise((resolve, reject) => {
            this.wsConnection = new WebSocket(this.config.wsEndpoint);
            this.wsConnection.onopen = () => {
                console.log(`Connected to ${this.gameName} WebSocket`);
                this.wsConnection.send(JSON.stringify({
                    type: 'subscribe',
                    topics: ['player_updates', 'asset_transfers', 'achievements']
                }));
                resolve();
            };
            this.wsConnection.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };
            this.wsConnection.onerror = (error) => {
                console.error(`WebSocket error for ${this.gameName}:`, error);
                reject(error);
            };
            this.wsConnection.onclose = () => {
                console.log(`WebSocket connection closed for ${this.gameName}`);
                this.wsConnection = null;
            };
        });
    }
    async disconnectFromGameNetwork() {
        if (this.wsConnection) {
            this.wsConnection.close();
            this.wsConnection = null;
        }
    }
    async performHealthCheck() {
        const response = await fetch(this.config.rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'starknet_call',
                params: [
                    {
                        contract_address: this.dojoConfig.worldAddress,
                        entry_point_selector: 'get_world_info',
                        calldata: []
                    },
                    'latest'
                ],
                id: 1
            })
        });
        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }
        const result = await response.json();
        if (result.error) {
            throw new Error(`RPC error: ${result.error.message}`);
        }
    }
    async fetchPlayerInfo(playerId) {
        const response = await fetch(this.config.rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'starknet_call',
                params: [
                    {
                        contract_address: this.dojoConfig.systemAddresses.player,
                        entry_point_selector: 'get_player',
                        calldata: [playerId]
                    },
                    'latest'
                ],
                id: 1
            })
        });
        const result = await response.json();
        if (result.error) {
            throw new Error(`Failed to fetch player info: ${result.error.message}`);
        }
        return this.parsePlayerData(result.result);
    }
    async fetchPlayerAssets(playerId) {
        const response = await fetch(this.config.rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'starknet_call',
                params: [
                    {
                        contract_address: this.dojoConfig.systemAddresses.assets,
                        entry_point_selector: 'get_player_assets',
                        calldata: [playerId]
                    },
                    'latest'
                ],
                id: 1
            })
        });
        const result = await response.json();
        if (result.error) {
            throw new Error(`Failed to fetch player assets: ${result.error.message}`);
        }
        return this.parseAssetArray(result.result);
    }
    async fetchPlayerAchievements(playerId) {
        const response = await fetch(this.config.rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'starknet_call',
                params: [
                    {
                        contract_address: this.dojoConfig.systemAddresses.achievements,
                        entry_point_selector: 'get_player_achievements',
                        calldata: [playerId]
                    },
                    'latest'
                ],
                id: 1
            })
        });
        const result = await response.json();
        if (result.error) {
            throw new Error(`Failed to fetch player achievements: ${result.error.message}`);
        }
        return this.parseAchievementArray(result.result);
    }
    async fetchAssetFromContract(tokenId) {
        const response = await fetch(this.config.rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'starknet_call',
                params: [
                    {
                        contract_address: this.dojoConfig.systemAddresses.assets,
                        entry_point_selector: 'get_asset',
                        calldata: [tokenId]
                    },
                    'latest'
                ],
                id: 1
            })
        });
        const result = await response.json();
        if (result.error) {
            throw new Error(`Failed to fetch asset: ${result.error.message}`);
        }
        return this.parseAssetData(result.result);
    }
    handleWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'player_update' && this.updateCallback) {
                const playerData = {
                    playerId: message.player_id,
                    gameId: this.gameId,
                    rawData: message.data,
                    normalizedData: message.normalized_data,
                    syncedAt: Date.now()
                };
                this.updateCallback(playerData);
            }
        }
        catch (error) {
            console.error(`Error handling WebSocket message for ${this.gameName}:`, error);
        }
    }
    parsePlayerData(rawData) {
        return {
            id: rawData[0],
            level: parseInt(rawData[1], 16),
            experience: parseInt(rawData[2], 16),
            stats: {
                playtime: parseInt(rawData[3], 16),
                score: parseInt(rawData[4], 16)
            }
        };
    }
    parseAssetArray(rawData) {
        const assets = [];
        for (let i = 0; i < rawData.length; i += 6) {
            assets.push({
                id: rawData[i],
                token_id: rawData[i + 1],
                contract_address: rawData[i + 2],
                owner: rawData[i + 3],
                asset_type: parseInt(rawData[i + 4], 16),
                tradeable: rawData[i + 5] === '1'
            });
        }
        return assets;
    }
    parseAchievementArray(rawData) {
        const achievements = [];
        for (let i = 0; i < rawData.length; i += 5) {
            achievements.push({
                id: rawData[i],
                achievement_type: rawData[i + 1],
                rarity: parseInt(rawData[i + 2], 16),
                earned_at: parseInt(rawData[i + 3], 16),
                nft_badge_id: rawData[i + 4] !== '0' ? rawData[i + 4] : undefined
            });
        }
        return achievements;
    }
    parseAssetData(rawData) {
        return {
            id: rawData[0],
            token_id: rawData[1],
            contract_address: rawData[2],
            owner: rawData[3],
            asset_type: parseInt(rawData[4], 16),
            tradeable: rawData[5] === '1',
            metadata: rawData[6] ? JSON.parse(rawData[6]) : {}
        };
    }
}
exports.DojoGameAdapter = DojoGameAdapter;
//# sourceMappingURL=DojoGameAdapter.js.map