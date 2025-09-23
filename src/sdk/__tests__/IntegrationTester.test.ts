/**
 * Tests for IntegrationTester
 */

import { DojoGameSDK } from '../DojoGameSDK';
import { IntegrationTester } from '../testing/IntegrationTester';
import { BasePluginAdapter } from '../adapters/BasePluginAdapter';
import { MockDataGenerator } from '../testing/MockDataGenerator';

// Mock adapter for testing
class MockTestAdapter extends BasePluginAdapter {
  private mockGenerator: MockDataGenerator;

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

    this.mockGenerator = new MockDataGenerator();
  }

  override async fetchRawPlayerData(playerId: string): Promise<any> {
    const mockData = this.mockGenerator.generatePlayerData('test-game');
    return {
      player_id: playerId,
      assets: mockData.assets.map(asset => ({
        id: asset.id,
        token_id: asset.tokenId,
        contract_address: asset.contractAddress,
        owner: asset.owner,
        name: asset.metadata.name,
        metadata: asset.metadata
      })),
      achievements: mockData.achievements.map(achievement => ({
        id: achievement.id,
        player_id: achievement.playerId,
        type: achievement.achievementType,
        title: achievement.title,
        description: achievement.description,
        rarity: achievement.rarity,
        earned_at: achievement.earnedAt
      })),
      stats: mockData.statistics
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

describe('IntegrationTester', () => {
  let sdk: DojoGameSDK;
  let tester: IntegrationTester;
  let mockAdapter: MockTestAdapter;

  beforeEach(async () => {
    sdk = new DojoGameSDK({
      hubEndpoint: 'https://test-hub.com',
      gameId: 'test-game',
      gameName: 'Test Game',
      environment: 'development'
    });

    mockAdapter = new MockTestAdapter();
    await sdk.initialize(mockAdapter);
    
    tester = new IntegrationTester(sdk);
  });

  afterEach(async () => {
    if (sdk.initialized) {
      await sdk.shutdown();
    }
  });

  describe('Full Test Suite', () => {
    test('should run full test suite successfully', async () => {
      const results = await tester.runFullTestSuite();

      expect(results).toBeDefined();
      expect(results.suiteName).toBe('Universal Gaming Hub Integration Tests');
      expect(Array.isArray(results.tests)).toBe(true);
      expect(typeof results.overallPassed).toBe('boolean');
      expect(typeof results.totalDuration).toBe('number');
      expect(results.summary).toBeDefined();
      expect(typeof results.summary.passed).toBe('number');
      expect(typeof results.summary.failed).toBe('number');
      expect(typeof results.summary.warnings).toBe('number');
    });

    test('should have reasonable test execution time', async () => {
      const startTime = Date.now();
      const results = await tester.runFullTestSuite();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(results.totalDuration).toBeLessThan(30000);
    });
  });

  describe('Connectivity Tests', () => {
    test('should run connectivity tests', async () => {
      const tests = await tester.runConnectivityTests();

      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);

      // Check test structure
      for (const test of tests) {
        expect(test.testName).toBeDefined();
        expect(typeof test.passed).toBe('boolean');
        expect(typeof test.duration).toBe('number');
        expect(test.details).toBeDefined();
      }
    });

    test('should include SDK initialization test', async () => {
      const tests = await tester.runConnectivityTests();
      const initTest = tests.find(t => t.testName === 'SDK Initialization');

      expect(initTest).toBeDefined();
      expect(initTest!.passed).toBe(true);
    });

    test('should include adapter connection test', async () => {
      const tests = await tester.runConnectivityTests();
      const connectionTest = tests.find(t => t.testName === 'Adapter Connection');

      expect(connectionTest).toBeDefined();
      expect(connectionTest!.passed).toBe(true);
    });
  });

  describe('Data Validation Tests', () => {
    test('should run data validation tests', async () => {
      const tests = await tester.runDataValidationTests();

      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);

      // Should include data normalization test
      const normalizationTest = tests.find(t => t.testName === 'Data Normalization');
      expect(normalizationTest).toBeDefined();
    });

    test('should include asset validation test', async () => {
      const tests = await tester.runDataValidationTests();
      const assetTest = tests.find(t => t.testName === 'Asset Validation');

      expect(assetTest).toBeDefined();
    });

    test('should include edge case handling test', async () => {
      const tests = await tester.runDataValidationTests();
      const edgeCaseTest = tests.find(t => t.testName === 'Edge Case Handling');

      expect(edgeCaseTest).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should run performance tests', async () => {
      const tests = await tester.runPerformanceTests();

      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);

      // Should include sync performance test
      const syncTest = tests.find(t => t.testName === 'Single Player Sync Performance');
      expect(syncTest).toBeDefined();
    });

    test('should measure sync performance', async () => {
      const tests = await tester.runPerformanceTests();
      const syncTest = tests.find(t => t.testName === 'Single Player Sync Performance');

      expect(syncTest).toBeDefined();
      expect(syncTest!.duration).toBeGreaterThan(0);
      expect(syncTest!.details).toContain('completed in');
    });

    test('should include batch performance test', async () => {
      const tests = await tester.runPerformanceTests();
      const batchTest = tests.find(t => t.testName === 'Batch Sync Performance');

      expect(batchTest).toBeDefined();
    });
  });

  describe('Error Handling Tests', () => {
    test('should run error handling tests', async () => {
      const tests = await tester.runErrorHandlingTests();

      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);
    });

    test('should test invalid player ID handling', async () => {
      const tests = await tester.runErrorHandlingTests();
      const invalidPlayerTest = tests.find(t => t.testName === 'Invalid Player ID Handling');

      expect(invalidPlayerTest).toBeDefined();
    });

    test('should test malformed data handling', async () => {
      const tests = await tester.runErrorHandlingTests();
      const malformedDataTest = tests.find(t => t.testName === 'Malformed Data Handling');

      expect(malformedDataTest).toBeDefined();
    });
  });

  describe('Real-time Tests', () => {
    test('should run real-time tests', async () => {
      const tests = await tester.runRealTimeTests();

      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);
    });

    test('should test WebSocket connection', async () => {
      const tests = await tester.runRealTimeTests();
      const wsTest = tests.find(t => t.testName === 'WebSocket Connection');

      expect(wsTest).toBeDefined();
    });

    test('should test player update subscription', async () => {
      const tests = await tester.runRealTimeTests();
      const subscriptionTest = tests.find(t => t.testName === 'Player Update Subscription');

      expect(subscriptionTest).toBeDefined();
    });
  });

  describe('Game-specific Tests', () => {
    test('should run game-specific tests', async () => {
      const tests = await tester.runGameSpecificTests('test-game');

      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);
    });

    test('should test game-specific asset types', async () => {
      const tests = await tester.runGameSpecificTests('test-game');
      const assetTest = tests.find(t => t.testName === 'test-game Asset Types');

      expect(assetTest).toBeDefined();
    });

    test('should test game-specific achievements', async () => {
      const tests = await tester.runGameSpecificTests('test-game');
      const achievementTest = tests.find(t => t.testName === 'test-game Achievements');

      expect(achievementTest).toBeDefined();
    });
  });

  describe('Health Report', () => {
    test('should generate health report', async () => {
      const report = await tester.generateHealthReport();

      expect(report).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(report.overallHealth);
      expect(Array.isArray(report.healthChecks)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    test('should include health checks in report', async () => {
      const report = await tester.generateHealthReport();

      expect(report.healthChecks.length).toBeGreaterThan(0);

      for (const check of report.healthChecks) {
        expect(check.name).toBeDefined();
        expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
        expect(typeof check.lastChecked).toBe('number');
      }
    });

    test('should provide recommendations when issues exist', async () => {
      const report = await tester.generateHealthReport();

      // Recommendations should be strings
      for (const recommendation of report.recommendations) {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Test Result Structure', () => {
    test('should have consistent test result structure', async () => {
      const tests = await tester.runConnectivityTests();

      for (const test of tests) {
        expect(test).toHaveProperty('testName');
        expect(test).toHaveProperty('passed');
        expect(test).toHaveProperty('duration');
        expect(test).toHaveProperty('details');

        expect(typeof test.testName).toBe('string');
        expect(typeof test.passed).toBe('boolean');
        expect(typeof test.duration).toBe('number');
        expect(typeof test.details).toBe('string');

        if (test.errors) {
          expect(Array.isArray(test.errors)).toBe(true);
        }

        if (test.warnings) {
          expect(Array.isArray(test.warnings)).toBe(true);
        }
      }
    });

    test('should have reasonable test durations', async () => {
      const tests = await tester.runConnectivityTests();

      for (const test of tests) {
        expect(test.duration).toBeGreaterThanOrEqual(0);
        expect(test.duration).toBeLessThan(10000); // No test should take more than 10 seconds
      }
    });
  });

  describe('Error Scenarios', () => {
    test('should handle tester creation with uninitialized SDK', () => {
      const uninitializedSDK = new DojoGameSDK({
        hubEndpoint: 'https://test-hub.com',
        gameId: 'test-game',
        gameName: 'Test Game',
        environment: 'development'
      });

      expect(() => new IntegrationTester(uninitializedSDK)).not.toThrow();
    });

    test('should handle test failures gracefully', async () => {
      // Create a failing adapter
      const failingAdapter = new MockTestAdapter();
      failingAdapter.fetchRawPlayerData = jest.fn().mockRejectedValue(new Error('Test failure'));

      const failingSDK = new DojoGameSDK({
        hubEndpoint: 'https://test-hub.com',
        gameId: 'failing-game',
        gameName: 'Failing Game',
        environment: 'development'
      });

      await failingSDK.initialize(failingAdapter);
      const failingTester = new IntegrationTester(failingSDK);

      const tests = await failingTester.runConnectivityTests();

      // Should still return test results, even if some fail
      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);

      await failingSDK.shutdown();
    });
  });
});