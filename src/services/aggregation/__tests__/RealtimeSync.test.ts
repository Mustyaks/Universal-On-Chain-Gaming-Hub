/**
 * Tests for real-time synchronization components
 */

import { RealtimeAggregationService } from '../RealtimeAggregationService';
import { DataValidationService } from '../DataValidationService';
import { RedisEventManager } from '../RedisEventManager';
import { WebSocketGameClient } from '../WebSocketGameClient';
import { createRealtimeConfig } from '../config/realtimeConfig';
import {
    StandardizedGameData,
    GameAsset,
    Achievement,
    GameStatistics
} from '../../../types/core';

// Mock Redis for testing
jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        publish: jest.fn().mockResolvedValue(1),
        subscribe: jest.fn().mockResolvedValue(undefined),
        pSubscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null),
        setEx: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        keys: jest.fn().mockResolvedValue([]),
        ping: jest.fn().mockResolvedValue('PONG'),
        info: jest.fn().mockResolvedValue('used_memory_human:1.00M'),
        dbSize: jest.fn().mockResolvedValue(0),
        isReady: true,
        on: jest.fn(),
        off: jest.fn()
    }))
}));

// Mock WebSocket for testing
jest.mock('ws', () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
            on: jest.fn(),
            send: jest.fn(),
            close: jest.fn(),
            readyState: 1, // OPEN
            OPEN: 1
        })),
        Server: jest.fn().mockImplementation(() => ({
            on: jest.fn(),
            close: jest.fn()
        }))
    };
});

describe('DataValidationService', () => {
    let validationService: DataValidationService;
    let mockGameData: StandardizedGameData;

    beforeEach(() => {
        const config = createRealtimeConfig('test').validation;
        validationService = new DataValidationService(config);

        mockGameData = {
            playerId: 'player123',
            gameId: 'dojo-chess',
            assets: [
                {
                    id: 'asset1',
                    gameId: 'dojo-chess',
                    tokenId: '1',
                    contractAddress: '0x123',
                    assetType: 'NFT',
                    metadata: {
                        name: 'Chess Piece',
                        description: 'A rare chess piece',
                        image: 'https://example.com/image.png',
                        attributes: []
                    },
                    owner: '0xabc',
                    tradeable: true
                }
            ],
            achievements: [
                {
                    id: 'achievement1',
                    gameId: 'dojo-chess',
                    playerId: 'player123',
                    achievementType: 'VICTORY',
                    title: 'First Win',
                    description: 'Won your first game',
                    rarity: 'COMMON',
                    earnedAt: Date.now() - 1000
                }
            ],
            statistics: {
                gameId: 'dojo-chess',
                playerId: 'player123',
                playtime: 3600,
                level: 5,
                score: 1200,
                customStats: { wins: 10, losses: 5 }
            },
            lastUpdated: Date.now() - 1000
        };
    });

    test('should validate correct game data', async () => {
        const result = await validationService.validateGameData(mockGameData);
        
        expect(result.isValid).toBe(true);
        expect(result.score).toBeGreaterThan(70);
        expect(result.errors).toHaveLength(0);
    });

    test('should detect missing required fields', async () => {
        const invalidData = { ...mockGameData };
        delete (invalidData as any).playerId;
        
        const result = await validationService.validateGameData(invalidData);
        
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_PLAYER_ID')).toBe(true);
    });

    test('should validate individual assets', async () => {
        const asset = mockGameData.assets[0];
        const result = await validationService.validateAsset(asset);
        
        expect(result.isValid).toBe(true);
        expect(result.score).toBeGreaterThan(70);
    });

    test('should validate achievements', async () => {
        const achievement = mockGameData.achievements[0];
        const result = await validationService.validateAchievement(achievement);
        
        expect(result.isValid).toBe(true);
        expect(result.score).toBeGreaterThan(70);
    });

    test('should detect future achievement timestamps', async () => {
        const futureAchievement = {
            ...mockGameData.achievements[0],
            earnedAt: Date.now() + 86400000 // Tomorrow
        };
        
        const result = await validationService.validateAchievement(futureAchievement);
        
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === 'FUTURE_ACHIEVEMENT')).toBe(true);
    });
});

describe('RedisEventManager', () => {
    let redisManager: RedisEventManager;

    beforeEach(async () => {
        const config = createRealtimeConfig('test').redis;
        redisManager = new RedisEventManager(config);
        await redisManager.initialize();
    });

    afterEach(async () => {
        await redisManager.shutdown();
    });

    test('should initialize successfully', async () => {
        const isHealthy = await redisManager.isHealthy();
        expect(isHealthy).toBe(true);
    });

    test('should cache and retrieve game data', async () => {
        const mockData: StandardizedGameData = {
            playerId: 'player123',
            gameId: 'dojo-chess',
            assets: [],
            achievements: [],
            statistics: {
                gameId: 'dojo-chess',
                playerId: 'player123',
                playtime: 0,
                level: 1,
                score: 0,
                customStats: {}
            },
            lastUpdated: Date.now()
        };

        await redisManager.cacheGameData('player123', 'dojo-chess', mockData);
        const retrieved = await redisManager.getCachedGameData('player123', 'dojo-chess');
        
        expect(retrieved).toEqual(mockData);
    });

    test('should publish and handle events', async () => {
        const testData = { message: 'test event' };
        let receivedData: any = null;

        await redisManager.subscribeToChannel('test-channel', (data) => {
            receivedData = data;
        });

        await redisManager.publishEvent('test-channel', testData);
        
        // Give some time for the event to be processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(receivedData).toEqual(testData);
    });
});

describe('WebSocketGameClient', () => {
    let wsClient: WebSocketGameClient;

    beforeEach(() => {
        const config = {
            gameId: 'dojo-chess',
            wsEndpoint: 'ws://localhost:3001/ws',
            reconnectInterval: 1000,
            maxReconnectAttempts: 3,
            heartbeatInterval: 5000,
            messageTimeout: 5000
        };
        
        wsClient = new WebSocketGameClient(config);
    });

    afterEach(async () => {
        await wsClient.disconnect();
    });

    test('should initialize with correct configuration', () => {
        const status = wsClient.getConnectionStatus();
        expect(status.gameId).toBe('dojo-chess');
        expect(status.connected).toBe(false);
        expect(status.subscribedPlayers).toBe(0);
    });

    test('should handle connection events', () => {
        const connectSpy = jest.fn();
        const errorSpy = jest.fn();
        
        wsClient.on('connected', connectSpy);
        wsClient.on('error', errorSpy);
        
        // Simulate connection
        wsClient.emit('connected');
        expect(connectSpy).toHaveBeenCalled();
    });
});

describe('RealtimeAggregationService Integration', () => {
    let aggregationService: RealtimeAggregationService;
    let mockGameAdapter: any;

    beforeEach(async () => {
        const config = createRealtimeConfig('test');
        aggregationService = new RealtimeAggregationService(config);
        
        // Mock game adapter
        mockGameAdapter = {
            gameId: 'dojo-chess',
            gameName: 'Dojo Chess',
            version: '1.0.0',
            supportedFeatures: ['ASSETS', 'ACHIEVEMENTS', 'REAL_TIME_UPDATES'],
            subscribeToUpdates: jest.fn(),
            unsubscribeFromUpdates: jest.fn(),
            subscribeToPlayerUpdates: jest.fn(),
            unsubscribeFromPlayerUpdates: jest.fn(),
            on: jest.fn(),
            emit: jest.fn()
        };
        
        await aggregationService.initialize();
    });

    afterEach(async () => {
        await aggregationService.shutdown();
    });

    test('should initialize successfully', async () => {
        const health = await aggregationService.getHealthStatus();
        expect(health.healthy).toBe(true);
    });

    test('should register game adapters', async () => {
        await aggregationService.registerGameAdapter(mockGameAdapter);
        
        const metrics = aggregationService.getMetrics();
        expect(metrics).toBeDefined();
    });

    test('should handle player subscriptions', async () => {
        await aggregationService.registerGameAdapter(mockGameAdapter);
        
        const callback = jest.fn();
        await aggregationService.subscribeToPlayer('player123', callback, ['dojo-chess']);
        
        const metrics = aggregationService.getMetrics();
        expect(metrics.activeSubscriptions).toBe(1);
        
        await aggregationService.unsubscribeFromPlayer('player123');
        
        const updatedMetrics = aggregationService.getMetrics();
        expect(updatedMetrics.activeSubscriptions).toBe(0);
    });

    test('should process game data updates', async () => {
        await aggregationService.registerGameAdapter(mockGameAdapter);
        
        const mockData: StandardizedGameData = {
            playerId: 'player123',
            gameId: 'dojo-chess',
            assets: [],
            achievements: [],
            statistics: {
                gameId: 'dojo-chess',
                playerId: 'player123',
                playtime: 3600,
                level: 5,
                score: 1200,
                customStats: {}
            },
            lastUpdated: Date.now()
        };
        
        await aggregationService.processGameDataUpdate('player123', 'dojo-chess', mockData);
        
        const metrics = aggregationService.getMetrics();
        expect(metrics.totalUpdates).toBeGreaterThan(0);
        expect(metrics.validUpdates).toBeGreaterThan(0);
    });

    test('should handle invalid data gracefully', async () => {
        await aggregationService.registerGameAdapter(mockGameAdapter);
        
        const invalidData = {
            // Missing required fields
            assets: [],
            achievements: [],
            statistics: {}
        } as any;
        
        await aggregationService.processGameDataUpdate('player123', 'dojo-chess', invalidData);
        
        const metrics = aggregationService.getMetrics();
        expect(metrics.invalidUpdates).toBeGreaterThan(0);
    });
});

describe('End-to-End Real-time Flow', () => {
    let aggregationService: RealtimeAggregationService;
    let mockGameAdapter: any;

    beforeEach(async () => {
        const config = createRealtimeConfig('test');
        aggregationService = new RealtimeAggregationService(config);
        
        mockGameAdapter = {
            gameId: 'dojo-chess',
            gameName: 'Dojo Chess',
            version: '1.0.0',
            supportedFeatures: ['ASSETS', 'ACHIEVEMENTS', 'REAL_TIME_UPDATES'],
            subscribeToUpdates: jest.fn(),
            unsubscribeFromUpdates: jest.fn(),
            subscribeToPlayerUpdates: jest.fn(),
            unsubscribeFromPlayerUpdates: jest.fn(),
            on: jest.fn(),
            emit: jest.fn()
        };
        
        await aggregationService.initialize();
        await aggregationService.registerGameAdapter(mockGameAdapter);
    });

    afterEach(async () => {
        await aggregationService.shutdown();
    });

    test('should handle complete real-time update flow', async () => {
        const receivedUpdates: any[] = [];
        
        // Subscribe to player updates
        await aggregationService.subscribeToPlayer('player123', (update) => {
            receivedUpdates.push(update);
        }, ['dojo-chess']);
        
        // Simulate game data update
        const mockData: StandardizedGameData = {
            playerId: 'player123',
            gameId: 'dojo-chess',
            assets: [{
                id: 'new-asset',
                gameId: 'dojo-chess',
                tokenId: '123',
                contractAddress: '0x123',
                assetType: 'NFT',
                metadata: {
                    name: 'New Chess Piece',
                    description: 'A newly acquired piece',
                    image: 'https://example.com/new.png',
                    attributes: []
                },
                owner: '0xabc',
                tradeable: true
            }],
            achievements: [],
            statistics: {
                gameId: 'dojo-chess',
                playerId: 'player123',
                playtime: 3600,
                level: 5,
                score: 1200,
                customStats: {}
            },
            lastUpdated: Date.now()
        };
        
        // Process the update
        await aggregationService.processGameDataUpdate('player123', 'dojo-chess', mockData, 'WEBSOCKET');
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify metrics were updated
        const metrics = aggregationService.getMetrics();
        expect(metrics.totalUpdates).toBeGreaterThan(0);
        expect(metrics.validUpdates).toBeGreaterThan(0);
        expect(metrics.activeSubscriptions).toBe(1);
        
        // Verify cached data can be retrieved
        const cachedData = await aggregationService.getCachedGameData('player123', 'dojo-chess');
        expect(cachedData).toBeDefined();
    });
});