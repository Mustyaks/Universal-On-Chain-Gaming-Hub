"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRealtimeSync = setupRealtimeSync;
exports.subscribeToPlayerUpdates = subscribeToPlayerUpdates;
exports.processManualUpdate = processManualUpdate;
exports.monitorSystemHealth = monitorSystemHealth;
exports.runRealtimeSyncExample = runRealtimeSyncExample;
const RealtimeAggregationService_1 = require("../RealtimeAggregationService");
const GameAdapter_1 = require("../GameAdapter");
const realtimeConfig_1 = require("../config/realtimeConfig");
class DojoChessAdapter extends GameAdapter_1.BaseGameAdapter {
    constructor() {
        const config = {
            gameId: 'dojo-chess',
            gameName: 'Dojo Chess',
            contractAddress: '0x123456789abcdef',
            rpcEndpoint: 'https://starknet-mainnet.public.blastapi.io',
            wsEndpoint: 'ws://localhost:3001/ws',
            retryConfig: {
                maxRetries: 3,
                baseDelayMs: 1000,
                maxDelayMs: 10000,
                backoffMultiplier: 2
            },
            cacheConfig: {
                ttlSeconds: 300,
                maxEntries: 1000,
                enableCache: true
            }
        };
        super(config);
    }
    get supportedFeatures() {
        return ['ASSETS', 'ACHIEVEMENTS', 'STATISTICS', 'REAL_TIME_UPDATES'];
    }
    async normalize(rawData) {
        return {
            playerId: rawData.player_id,
            gameId: this.gameId,
            assets: this.normalizeChessAssets(rawData.pieces || []),
            achievements: this.normalizeChessAchievements(rawData.achievements || []),
            statistics: this.normalizeChessStatistics(rawData.stats || {}),
            lastUpdated: rawData.last_updated || Date.now()
        };
    }
    async fetchRawPlayerData(playerId) {
        return {
            player_id: playerId,
            pieces: [
                {
                    id: 'piece_1',
                    type: 'queen',
                    color: 'white',
                    token_id: '1001',
                    rarity: 'LEGENDARY',
                    owner: playerId
                }
            ],
            achievements: [
                {
                    id: 'first_win',
                    type: 'VICTORY',
                    title: 'First Victory',
                    description: 'Won your first chess game',
                    earned_at: Date.now() - 86400000,
                    rarity: 'COMMON'
                }
            ],
            stats: {
                games_played: 25,
                wins: 15,
                losses: 8,
                draws: 2,
                rating: 1450,
                playtime: 7200
            },
            last_updated: Date.now()
        };
    }
    async validateAsset(asset) {
        const validPieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
        const pieceType = asset.metadata.attributes?.find(attr => attr.trait_type === 'piece_type')?.value;
        return validPieceTypes.includes(pieceType);
    }
    async connectToGameNetwork() {
        console.log(`Connecting to Dojo Chess network at ${this.config.rpcEndpoint}`);
    }
    async disconnectFromGameNetwork() {
        console.log('Disconnecting from Dojo Chess network');
    }
    normalizeChessAssets(rawPieces) {
        return rawPieces.map(piece => ({
            id: piece.id,
            gameId: this.gameId,
            tokenId: piece.token_id,
            contractAddress: this.config.contractAddress,
            assetType: 'NFT',
            metadata: {
                name: `${piece.color} ${piece.type}`,
                description: `A ${piece.rarity.toLowerCase()} chess piece`,
                image: `https://chess-assets.example.com/${piece.type}_${piece.color}.png`,
                attributes: [
                    { trait_type: 'piece_type', value: piece.type },
                    { trait_type: 'color', value: piece.color },
                    { trait_type: 'rarity', value: piece.rarity }
                ],
                rarity: piece.rarity
            },
            owner: piece.owner,
            tradeable: true
        }));
    }
    normalizeChessAchievements(rawAchievements) {
        return rawAchievements.map(achievement => ({
            id: achievement.id,
            gameId: this.gameId,
            playerId: achievement.player_id,
            achievementType: achievement.type,
            title: achievement.title,
            description: achievement.description,
            rarity: achievement.rarity,
            earnedAt: achievement.earned_at
        }));
    }
    normalizeChessStatistics(rawStats) {
        return {
            gameId: this.gameId,
            playerId: rawStats.player_id,
            playtime: rawStats.playtime || 0,
            level: Math.floor((rawStats.rating || 1000) / 100),
            score: rawStats.rating || 1000,
            customStats: {
                gamesPlayed: rawStats.games_played || 0,
                wins: rawStats.wins || 0,
                losses: rawStats.losses || 0,
                draws: rawStats.draws || 0,
                winRate: rawStats.wins / Math.max(rawStats.games_played, 1)
            }
        };
    }
}
async function setupRealtimeSync() {
    console.log('Setting up real-time synchronization system...');
    const config = (0, realtimeConfig_1.createRealtimeConfig)(process.env['NODE_ENV'] || 'development');
    const aggregationService = new RealtimeAggregationService_1.RealtimeAggregationService(config);
    await aggregationService.initialize();
    const validationService = aggregationService.validationService;
    realtimeConfig_1.knownContractAddresses.forEach(address => {
        validationService.addKnownContractAddress(address);
    });
    const chessAdapter = new DojoChessAdapter();
    await aggregationService.registerGameAdapter(chessAdapter);
    aggregationService.on('dataUpdated', (update) => {
        console.log(`Data updated for player ${update.playerId} in game ${update.gameId}:`, update.updateType);
    });
    aggregationService.on('adapterError', ({ gameId, error }) => {
        console.error(`Adapter error for ${gameId}:`, error);
    });
    aggregationService.on('processingError', ({ playerId, gameId, error }) => {
        console.error(`Processing error for ${playerId}/${gameId}:`, error);
    });
    console.log('Real-time synchronization system initialized successfully');
    return aggregationService;
}
async function subscribeToPlayerUpdates(aggregationService, playerId) {
    console.log(`Subscribing to updates for player: ${playerId}`);
    await aggregationService.subscribeToPlayer(playerId, (update) => {
        console.log(`Received update for ${playerId}:`, {
            gameId: update.gameId,
            updateType: update.updateType,
            timestamp: new Date(update.timestamp).toISOString(),
            assetsCount: update.data.assets.length,
            achievementsCount: update.data.achievements.length
        });
        switch (update.updateType) {
            case 'ACHIEVEMENT_EARNED':
                console.log('🏆 New achievement earned!');
                break;
            case 'ASSET_CHANGE':
                console.log('💎 Assets updated!');
                break;
            case 'STATS_UPDATE':
                console.log('📊 Statistics updated!');
                break;
            case 'FULL_SYNC':
                console.log('🔄 Full data sync completed!');
                break;
        }
    });
}
async function processManualUpdate(aggregationService, playerId, gameId) {
    console.log(`Processing manual update for ${playerId} in ${gameId}`);
    const updatedData = {
        playerId,
        gameId,
        assets: [
            {
                id: 'new_piece_123',
                gameId,
                tokenId: '2001',
                contractAddress: '0x123456789abcdef',
                assetType: 'NFT',
                metadata: {
                    name: 'Golden Knight',
                    description: 'A rare golden chess knight',
                    image: 'https://chess-assets.example.com/golden_knight.png',
                    attributes: [
                        { trait_type: 'piece_type', value: 'knight' },
                        { trait_type: 'color', value: 'gold' },
                        { trait_type: 'rarity', value: 'EPIC' }
                    ],
                    rarity: 'EPIC'
                },
                owner: playerId,
                tradeable: true
            }
        ],
        achievements: [
            {
                id: 'rare_piece_collector',
                gameId,
                playerId,
                achievementType: 'COLLECTION',
                title: 'Rare Piece Collector',
                description: 'Collected your first epic chess piece',
                rarity: 'RARE',
                earnedAt: Date.now()
            }
        ],
        statistics: {
            gameId,
            playerId,
            playtime: 8400,
            level: 16,
            score: 1580,
            customStats: {
                gamesPlayed: 30,
                wins: 20,
                losses: 8,
                draws: 2,
                winRate: 0.67
            }
        },
        lastUpdated: Date.now()
    };
    await aggregationService.processGameDataUpdate(playerId, gameId, updatedData, 'MANUAL');
}
async function monitorSystemHealth(aggregationService) {
    console.log('Starting system health monitoring...');
    setInterval(async () => {
        const health = await aggregationService.getHealthStatus();
        const metrics = aggregationService.getMetrics();
        console.log('System Health Report:', {
            healthy: health.healthy,
            services: health.services,
            metrics: {
                totalUpdates: metrics.totalUpdates,
                validUpdates: metrics.validUpdates,
                invalidUpdates: metrics.invalidUpdates,
                activeSubscriptions: metrics.activeSubscriptions,
                cacheHitRate: Math.round(metrics.cacheHitRate * 100) + '%',
                avgValidationTime: Math.round(metrics.averageValidationTime) + 'ms',
                avgProcessingTime: Math.round(metrics.averageProcessingTime) + 'ms'
            }
        });
        if (!health.healthy) {
            console.error('⚠️ System health check failed!');
        }
    }, 30000);
}
async function runRealtimeSyncExample() {
    try {
        const aggregationService = await setupRealtimeSync();
        const testPlayerId = 'player_test_123';
        await subscribeToPlayerUpdates(aggregationService, testPlayerId);
        await processManualUpdate(aggregationService, testPlayerId, 'dojo-chess');
        monitorSystemHealth(aggregationService);
        console.log('Real-time sync example is running. Press Ctrl+C to stop.');
        process.on('SIGINT', async () => {
            console.log('\nShutting down real-time sync system...');
            await aggregationService.shutdown();
            process.exit(0);
        });
    }
    catch (error) {
        console.error('Failed to run real-time sync example:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    runRealtimeSyncExample();
}
//# sourceMappingURL=realtimeExample.js.map