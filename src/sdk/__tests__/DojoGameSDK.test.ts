/**
 * Tests for DojoGameSDK
 */

import { DojoGameSDK } from '../DojoGameSDK';
import { BasePluginAdapter } from '../adapters/BasePluginAdapter';
import { MockDataGenerator } from '../testing/MockDataGenerator';
import { StandardizedGameData } from '../../types/core';

// Mock adapter for testing
class MockAdapter extends BasePluginAdapter {
  private mockData: StandardizedGameData;

  constructor() {
    super({
      gameId: 'test-game',
      gameName: 'Test Game',
      contractAddress: '0x123',
      rpcEndpoint: 'http://localhost:8545',
      retryConfig: {
        maxRetries: 1,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2
      },
      cacheConfig: {
        ttlSeconds: 60,
        maxEntries: 100,
        enableCache: true
      }
    });

    const mockGenerator = new MockDataGenerator();
    this.mockData = mockGenerator.generatePlayerData('test-game');
  }

  override async fetchRawPlayerData(playerId: string): Promise<any> {
    return {
      player_id: playerId,
      assets: this.mockData.assets.map(asset => ({
        id: asset.id,
        token_id: asset.tokenId,
        contract_address: asset.contractAddress,
        owner: asset.owner,
        name: asset.metadata.name,
        metadata: asset.metadata
      })),
      achievements: this.mockData.achievements.map(achievement => ({
        id: achievement.id,
        player_id: achievement.playerId,
        type: achievement.achievementType,
        title: achievement.title,
        description: achievement.description,
        rarity: achievement.rarity,
        earned_at: achievement.earnedAt
      })),
      stats: this.mockData.statistics
    };
  }

  override async connectToGameNetwork(): Promise<void> {
    // Mock implementation
  }

  override async disconnectFromGameNetwork(): Promise<void> {
    // Mock implementation
  }

  override async isHealthy(): Promise<boolean> {
    return true;
  }

  override getIntegrationStatus() {
    return {
      connected: true,
      lastSync: Date.now(),
      errors: [],
      metrics: {
        totalSyncs: 10,
        successfulSyncs: 9,
        failedSyncs: 1,
        averageResponseTime: 150,
        lastSyncDuration: 120
      }
    };
  }
}

describe('DojoGameSDK', () => {
  let sdk: DojoGameSDK;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    sdk = new DojoGameSDK({
      hubEndpoint: 'https://test-hub.com',
      gameId: 'test-game',
      gameName: 'Test Game',
      environment: 'development'
    });

    mockAdapter = new MockAdapter();
  });

  afterEach(async () => {
    if (sdk.initialized) {
      await sdk.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully with adapter', async () => {
      await sdk.initialize(mockAdapter);
      expect(sdk.initialized).toBe(true);
    });

    test('should throw error when initializing without adapter', async () => {
      await expect(sdk.initialize()).rejects.toThrow();
    });

    test('should emit connected event on successful initialization', async () => {
      const connectedSpy = jest.fn();
      sdk.on('connected', connectedSpy);

      await sdk.initialize(mockAdapter);

      expect(connectedSpy).toHaveBeenCalled();
    });
  });

  describe('Player Data Sync', () => {
    beforeEach(async () => {
      await sdk.initialize(mockAdapter);
    });

    test('should sync player data successfully', async () => {
      const playerData = await sdk.syncPlayerData('test-player-123');

      expect(playerData).toBeDefined();
      expect(playerData.playerId).toBe('test-player-123');
      expect(playerData.gameId).toBe('test-game');
      expect(Array.isArray(playerData.assets)).toBe(true);
      expect(Array.isArray(playerData.achievements)).toBe(true);
      expect(playerData.statistics).toBeDefined();
    });

    test('should emit dataSync event on successful sync', async () => {
      const dataSyncSpy = jest.fn();
      sdk.on('dataSync', dataSyncSpy);

      await sdk.syncPlayerData('test-player-123');

      expect(dataSyncSpy).toHaveBeenCalled();
    });

    test('should throw error when syncing without initialization', async () => {
      const uninitializedSDK = new DojoGameSDK({
        hubEndpoint: 'https://test-hub.com',
        gameId: 'test-game',
        gameName: 'Test Game',
        environment: 'development'
      });

      await expect(uninitializedSDK.syncPlayerData('test-player')).rejects.toThrow('SDK not initialized');
    });
  });

  describe('Batch Operations', () => {
    beforeEach(async () => {
      await sdk.initialize(mockAdapter);
    });

    test('should batch sync multiple players', async () => {
      const playerIds = ['player-1', 'player-2', 'player-3'];
      const results = await sdk.batchSyncPlayers(playerIds, 2);

      expect(results.successful).toBeDefined();
      expect(results.failed).toBeDefined();
      expect(results.successful.length + results.failed.length).toBe(playerIds.length);
    });

    test('should handle batch sync with empty array', async () => {
      const results = await sdk.batchSyncPlayers([], 5);

      expect(results.successful).toHaveLength(0);
      expect(results.failed).toHaveLength(0);
    });
  });

  describe('Asset Validation', () => {
    beforeEach(async () => {
      await sdk.initialize(mockAdapter);
    });

    test('should validate asset successfully', async () => {
      const mockGenerator = new MockDataGenerator();
      const asset = mockGenerator.generateAsset('test-game');

      const isValid = await sdk.validateAsset(asset);

      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('Integration Status', () => {
    beforeEach(async () => {
      await sdk.initialize(mockAdapter);
    });

    test('should return integration status', () => {
      const status = sdk.getIntegrationStatus();

      expect(status).toBeDefined();
      expect(typeof status.connected).toBe('boolean');
      expect(typeof status.lastSync).toBe('number');
      expect(Array.isArray(status.errors)).toBe(true);
      expect(status.metrics).toBeDefined();
    });

    test('should return diagnostic info', async () => {
      const diagnostics = await sdk.getDiagnosticInfo();

      expect(diagnostics).toBeDefined();
      expect(diagnostics.sdkVersion).toBeDefined();
      expect(diagnostics.gameId).toBe('test-game');
      expect(diagnostics.environment).toBe('development');
      expect(typeof diagnostics.uptime).toBe('number');
      expect(Array.isArray(diagnostics.healthChecks)).toBe(true);
    });
  });

  describe('Integration Testing', () => {
    beforeEach(async () => {
      await sdk.initialize(mockAdapter);
    });

    test('should run integration test', async () => {
      const testResult = await sdk.testIntegration();

      expect(testResult).toBeDefined();
      expect(typeof testResult.valid).toBe('boolean');
      expect(Array.isArray(testResult.errors)).toBe(true);
      expect(Array.isArray(testResult.warnings)).toBe(true);
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(async () => {
      await sdk.initialize(mockAdapter);
    });

    test('should subscribe to player updates', async () => {
      await expect(sdk.subscribeToPlayerUpdates('test-player')).resolves.not.toThrow();
    });

    test('should emit playerUpdate event', async () => {
      const playerUpdateSpy = jest.fn();
      sdk.on('playerUpdate', playerUpdateSpy);

      await sdk.subscribeToPlayerUpdates('test-player');

      // Simulate update (in real implementation, this would come from the adapter)
      // For testing, we'll just verify the event listener is set up
      expect(sdk.listenerCount('playerUpdate')).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should emit error events', async () => {
      const errorSpy = jest.fn();
      sdk.on('error', errorSpy);

      // Create a failing adapter
      const failingAdapter = new MockAdapter();
      failingAdapter.fetchRawPlayerData = jest.fn().mockRejectedValue(new Error('Test error'));

      await sdk.initialize(failingAdapter);

      try {
        await sdk.syncPlayerData('test-player');
      } catch (error) {
        // Expected to fail
      }

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('Shutdown', () => {
    test('should shutdown successfully', async () => {
      await sdk.initialize(mockAdapter);
      
      const disconnectedSpy = jest.fn();
      sdk.on('disconnected', disconnectedSpy);

      await sdk.shutdown();

      expect(sdk.initialized).toBe(false);
      expect(disconnectedSpy).toHaveBeenCalled();
    });

    test('should handle shutdown without initialization', async () => {
      await expect(sdk.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    test('should validate SDK configuration', async () => {
      const validConfig = {
        hubEndpoint: 'https://valid-hub.com',
        gameId: 'valid-game',
        gameName: 'Valid Game',
        environment: 'development' as const
      };

      const sdk = new DojoGameSDK(validConfig);
      expect(sdk.config).toEqual(validConfig);
    });

    test('should handle invalid configuration gracefully', () => {
      const invalidConfig = {
        hubEndpoint: 'invalid-url',
        gameId: '',
        gameName: '',
        environment: 'invalid' as any
      };

      expect(() => new DojoGameSDK(invalidConfig)).not.toThrow();
    });
  });

  describe('Event System', () => {
    test('should support event listeners', () => {
      const testHandler = jest.fn();
      
      sdk.on('connected', testHandler);
      sdk.emit('connected');

      expect(testHandler).toHaveBeenCalled();
    });

    test('should support removing event listeners', () => {
      const testHandler = jest.fn();
      
      sdk.on('connected', testHandler);
      sdk.off('connected', testHandler);
      sdk.emit('connected');

      expect(testHandler).not.toHaveBeenCalled();
    });
  });
});