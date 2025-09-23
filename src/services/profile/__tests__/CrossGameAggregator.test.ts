/**
 * CrossGameAggregator Unit Tests
 */

import { CrossGameAggregator, AggregatedPlayerData } from '../CrossGameAggregator';
import { DatabaseService, CacheService, EventService, AggregationService } from '@/types/services';
import { StandardizedGameData } from '@/types/core';

// Mock implementations
const mockDatabase: jest.Mocked<DatabaseService> = {
    findOne: jest.fn(),
    findMany: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn()
};

const mockCache: jest.Mocked<CacheService> = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn()
};

const mockEventService: jest.Mocked<EventService> = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
};

const mockAggregationService: jest.Mocked<AggregationService> = {
    registerGame: jest.fn(),
    syncPlayerData: jest.fn(),
    getPlayerGameData: jest.fn(),
    subscribeToPlayerUpdates: jest.fn()
};

const mockConfig = {
    updateInterval: 30000,
    batchSize: 10,
    maxRetries: 3,
    cacheTimeout: 300
};

describe('CrossGameAggregator', () => {
    let aggregator: CrossGameAggregator;

    beforeEach(() => {
        jest.clearAllMocks();
        aggregator = new CrossGameAggregator(
            mockDatabase,
            mockCache,
            mockEventService,
            mockAggregationService,
            mockConfig
        );
    });

    describe('aggregatePlayerData', () => {
        it('should return cached data if available', async () => {
            const playerId = 'test_player';
            const cachedData: AggregatedPlayerData = {
                playerId,
                totalAssets: 5,
                totalAchievements: 3,
                crossGameAssets: [],
                topAchievements: [],
                assetsByGame: {},
                achievementsByGame: {},
                lastAggregated: Date.now()
            };

            mockCache.get.mockResolvedValue(cachedData);

            const result = await aggregator.aggregatePlayerData(playerId);

            expect(result).toEqual(cachedData);
            expect(mockAggregationService.syncPlayerData).not.toHaveBeenCalled();
        });

        it('should aggregate data from multiple games', async () => {
            const playerId = 'test_player';
            const gameData: StandardizedGameData[] = [
                {
                    playerId,
                    gameId: 'game1',
                    assets: [
                        {
                            id: 'asset1',
                            gameId: 'game1',
                            tokenId: 'token1',
                            contractAddress: '0x123',
                            assetType: 'NFT',
                            metadata: {
                                name: 'Rare Sword',
                                description: 'A powerful weapon',
                                image: 'sword.png',
                                attributes: [],
                                rarity: 'RARE'
                            },
                            owner: playerId,
                            tradeable: true
                        }
                    ],
                    achievements: [
                        {
                            id: 'ach1',
                            gameId: 'game1',
                            playerId,
                            achievementType: 'combat',
                            title: 'First Victory',
                            description: 'Won your first battle',
                            rarity: 'COMMON',
                            earnedAt: Date.now()
                        }
                    ],
                    statistics: {
                        gameId: 'game1',
                        playerId,
                        playtime: 3600,
                        level: 5,
                        score: 1000,
                        customStats: {}
                    },
                    lastUpdated: Date.now()
                },
                {
                    playerId,
                    gameId: 'game2',
                    assets: [
                        {
                            id: 'asset2',
                            gameId: 'game2',
                            tokenId: 'token2',
                            contractAddress: '0x456',
                            assetType: 'CURRENCY',
                            metadata: {
                                name: 'Gold Coins',
                                description: 'In-game currency',
                                image: 'coins.png',
                                attributes: [],
                                rarity: 'COMMON'
                            },
                            owner: playerId,
                            tradeable: true
                        }
                    ],
                    achievements: [
                        {
                            id: 'ach2',
                            gameId: 'game2',
                            playerId,
                            achievementType: 'exploration',
                            title: 'Explorer',
                            description: 'Discovered 10 locations',
                            rarity: 'EPIC',
                            earnedAt: Date.now() - 1000
                        }
                    ],
                    statistics: {
                        gameId: 'game2',
                        playerId,
                        playtime: 7200,
                        level: 8,
                        score: 2500,
                        customStats: {}
                    },
                    lastUpdated: Date.now()
                }
            ];

            mockCache.get.mockResolvedValue(null);
            mockAggregationService.syncPlayerData.mockResolvedValue(gameData);

            const result = await aggregator.aggregatePlayerData(playerId);

            expect(result.playerId).toBe(playerId);
            expect(result.totalAssets).toBe(2);
            expect(result.totalAchievements).toBe(2);
            expect(result.crossGameAssets).toHaveLength(2);
            expect(result.topAchievements).toHaveLength(2);

            // Check that EPIC achievement is ranked higher than COMMON
            expect(result.topAchievements[0]?.rarity).toBe('EPIC');
            expect(result.topAchievements[1]?.rarity).toBe('COMMON');

            expect(mockCache.set).toHaveBeenCalledWith(
                `aggregated_player_data:${playerId}`,
                result,
                mockConfig.cacheTimeout
            );
        });

        it('should handle empty game data', async () => {
            const playerId = 'test_player';
            const gameData: StandardizedGameData[] = [];

            mockCache.get.mockResolvedValue(null);
            mockAggregationService.syncPlayerData.mockResolvedValue(gameData);

            const result = await aggregator.aggregatePlayerData(playerId);

            expect(result.totalAssets).toBe(0);
            expect(result.totalAchievements).toBe(0);
            expect(result.crossGameAssets).toHaveLength(0);
            expect(result.topAchievements).toHaveLength(0);
        });
    });

    describe('getUnifiedDashboardData', () => {
        it('should return complete dashboard data', async () => {
            const playerId = 'test_player';

            // Mock database calls for recent activity and statistics
            mockDatabase.findMany
                .mockResolvedValueOnce([]) // achievements for recent activity
                .mockResolvedValueOnce([]) // assets for recent activity
                .mockResolvedValueOnce([{ gameId: 'game1', lastActive: Date.now() }]) // game profiles
                .mockResolvedValueOnce([]) // assets for game statistics
                .mockResolvedValueOnce([]); // achievements for game statistics

            mockCache.get.mockResolvedValue(null);
            mockAggregationService.syncPlayerData.mockResolvedValue([]);

            const result = await aggregator.getUnifiedDashboardData(playerId);

            expect(result.playerId).toBe(playerId);
            expect(result.totalAssets).toBe(0);
            expect(result.totalAchievements).toBe(0);
            expect(result.recentActivity).toBeDefined();
            expect(result.gameStatistics).toBeDefined();
            expect(result.lastUpdated).toBeGreaterThan(0);
        });
    });

    describe('enableRealTimeUpdates', () => {
        it('should set up real-time updates for a player', async () => {
            const playerId = 'test_player';

            await aggregator.enableRealTimeUpdates(playerId);

            expect(mockAggregationService.subscribeToPlayerUpdates).toHaveBeenCalledWith(
                playerId,
                expect.any(Function)
            );
        });
    });

    describe('disableRealTimeUpdates', () => {
        it('should clean up real-time updates for a player', async () => {
            const playerId = 'test_player';

            // First enable updates
            await aggregator.enableRealTimeUpdates(playerId);

            // Then disable them
            aggregator.disableRealTimeUpdates(playerId);

            // The interval should be cleared (we can't easily test this directly)
            // but we can verify the method doesn't throw
            expect(() => aggregator.disableRealTimeUpdates(playerId)).not.toThrow();
        });
    });
});