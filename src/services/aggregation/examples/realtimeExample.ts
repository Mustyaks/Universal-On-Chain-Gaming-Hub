/**
 * Example implementation of real-time data synchronization
 * Demonstrates how to set up and use the real-time sync system
 */

import { RealtimeAggregationService } from '../RealtimeAggregationService';
import { BaseGameAdapter, GameAdapterConfig, GameFeature } from '../GameAdapter';
import { createRealtimeConfig, knownContractAddresses, RealtimeAggregationConfig } from '../config/realtimeConfig';
import {
    StandardizedGameData,
    GameAsset,
    Achievement,
    GameStatistics,
    PlayerGameData
} from '../../../types/core';

// Example Dojo Chess Game Adapter
class DojoChessAdapter extends BaseGameAdapter {
    constructor() {
        const config: GameAdapterConfig = {
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

    override get supportedFeatures(): GameFeature[] {
        return ['ASSETS', 'ACHIEVEMENTS', 'STATISTICS', 'REAL_TIME_UPDATES'];
    }

    async normalize(rawData: any): Promise<StandardizedGameData> {
        // Normalize chess game data to standard format
        return {
            playerId: rawData.player_id,
            gameId: this.gameId,
            assets: this.normalizeChessAssets(rawData.pieces || []),
            achievements: this.normalizeChessAchievements(rawData.achievements || []),
            statistics: this.normalizeChessStatistics(rawData.stats || {}),
            lastUpdated: rawData.last_updated || Date.now()
        };
    }

    async fetchRawPlayerData(playerId: string): Promise<any> {
        // Simulate fetching data from Dojo chess game
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
                    earned_at: Date.now() - 86400000, // Yesterday
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

    async validateAsset(asset: GameAsset): Promise<boolean> {
        // Validate chess piece assets
        const validPieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
        const pieceType = asset.metadata.attributes?.find(attr => attr.trait_type === 'piece_type')?.value;
        
        return validPieceTypes.includes(pieceType as string);
    }

    async connectToGameNetwork(): Promise<void> {
        // Connect to Dojo chess network
        console.log(`Connecting to Dojo Chess network at ${this.config.rpcEndpoint}`);
        // Implementation would connect to actual game network
    }

    async disconnectFromGameNetwork(): Promise<void> {
        // Disconnect from Dojo chess network
        console.log('Disconnecting from Dojo Chess network');
    }

    private normalizeChessAssets(rawPieces: any[]): GameAsset[] {
        return rawPieces.map(piece => ({
            id: piece.id,
            gameId: this.gameId,
            tokenId: piece.token_id,
            contractAddress: this.config.contractAddress,
            assetType: 'NFT' as const,
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

    private normalizeChessAchievements(rawAchievements: any[]): Achievement[] {
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

    private normalizeChessStatistics(rawStats: any): GameStatistics {
        return {
            gameId: this.gameId,
            playerId: rawStats.player_id,
            playtime: rawStats.playtime || 0,
            level: Math.floor((rawStats.rating || 1000) / 100), // Convert rating to level
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

// Example usage of the real-time synchronization system
export async function setupRealtimeSync(): Promise<RealtimeAggregationService> {
    console.log('Setting up real-time synchronization system...');
    
    // Create configuration based on environment
    const config = createRealtimeConfig(process.env['NODE_ENV'] as any || 'development');
    
    // Initialize the aggregation service
    const aggregationService = new RealtimeAggregationService(config);
    await aggregationService.initialize();
    
    // Add known contract addresses for validation
    const validationService = (aggregationService as any).validationService;
    knownContractAddresses.forEach(address => {
        validationService.addKnownContractAddress(address);
    });
    
    // Create and register game adapters
    const chessAdapter = new DojoChessAdapter();
    await aggregationService.registerGameAdapter(chessAdapter);
    
    // Set up event handlers
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

// Example of subscribing to player updates
export async function subscribeToPlayerUpdates(
    aggregationService: RealtimeAggregationService,
    playerId: string
): Promise<void> {
    console.log(`Subscribing to updates for player: ${playerId}`);
    
    await aggregationService.subscribeToPlayer(playerId, (update) => {
        console.log(`Received update for ${playerId}:`, {
            gameId: update.gameId,
            updateType: update.updateType,
            timestamp: new Date(update.timestamp).toISOString(),
            assetsCount: update.data.assets.length,
            achievementsCount: update.data.achievements.length
        });
        
        // Handle different types of updates
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

// Example of processing manual data updates
export async function processManualUpdate(
    aggregationService: RealtimeAggregationService,
    playerId: string,
    gameId: string
): Promise<void> {
    console.log(`Processing manual update for ${playerId} in ${gameId}`);
    
    // Simulate updated game data
    const updatedData: StandardizedGameData = {
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
            playtime: 8400, // 2.33 hours
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

// Example of monitoring system health
export async function monitorSystemHealth(
    aggregationService: RealtimeAggregationService
): Promise<void> {
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
    }, 30000); // Every 30 seconds
}

// Main example function
export async function runRealtimeSyncExample(): Promise<void> {
    try {
        // Set up the real-time sync system
        const aggregationService = await setupRealtimeSync();
        
        // Subscribe to a test player
        const testPlayerId = 'player_test_123';
        await subscribeToPlayerUpdates(aggregationService, testPlayerId);
        
        // Process a manual update to demonstrate the flow
        await processManualUpdate(aggregationService, testPlayerId, 'dojo-chess');
        
        // Start health monitoring
        monitorSystemHealth(aggregationService);
        
        console.log('Real-time sync example is running. Press Ctrl+C to stop.');
        
        // Keep the process running
        process.on('SIGINT', async () => {
            console.log('\nShutting down real-time sync system...');
            await aggregationService.shutdown();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('Failed to run real-time sync example:', error);
        process.exit(1);
    }
}

// Run the example if this file is executed directly
if (require.main === module) {
    runRealtimeSyncExample();
}