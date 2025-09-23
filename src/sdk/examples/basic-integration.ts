/**
 * Basic integration example for Dojo games
 * Shows how to set up and use the Universal Gaming Hub SDK
 */

import { DojoGameSDK, StandardDojoAdapter } from '../index';

async function basicIntegrationExample() {
  console.log('🎮 Starting Basic Integration Example');

  // Step 1: Configure the SDK
  const sdk = new DojoGameSDK({
    hubEndpoint: 'https://api.universalgaminghub.com',
    gameId: 'example-dojo-game',
    gameName: 'Example Dojo Game',
    environment: 'development', // Use 'production' for live games
    apiKey: process.env.HUB_API_KEY // Optional but recommended for production
  });

  // Step 2: Create and configure adapter
  const adapter = new StandardDojoAdapter({
    gameId: 'example-dojo-game',
    gameName: 'Example Dojo Game',
    contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
    rpcEndpoint: 'https://starknet-mainnet.public.blastapi.io',
    wsEndpoint: 'wss://starknet-mainnet.public.blastapi.io/ws',
    worldAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
    systemAddresses: {
      player: '0x1111111111111111111111111111111111111111',
      assets: '0x2222222222222222222222222222222222222222',
      achievements: '0x3333333333333333333333333333333333333333'
    },
    eventTopics: {
      playerUpdate: 'PlayerUpdated',
      assetTransfer: 'AssetTransferred',
      achievementEarned: 'AchievementEarned'
    },
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
  });

  try {
    // Step 3: Initialize the SDK
    console.log('🔧 Initializing SDK...');
    await sdk.initialize(adapter);
    console.log('✅ SDK initialized successfully');

    // Step 4: Test the integration
    console.log('🧪 Testing integration...');
    const testResult = await sdk.testIntegration();
    
    if (testResult.valid) {
      console.log('✅ Integration test passed');
    } else {
      console.warn('⚠️ Integration test found issues:', testResult.errors);
    }

    // Step 5: Sync player data
    const playerId = 'example-player-123';
    console.log(`📊 Syncing data for player: ${playerId}`);
    
    const playerData = await sdk.syncPlayerData(playerId);
    console.log('✅ Player data synced:', {
      playerId: playerData.playerId,
      assetsCount: playerData.assets.length,
      achievementsCount: playerData.achievements.length,
      level: playerData.statistics.level,
      score: playerData.statistics.score
    });

    // Step 6: Subscribe to real-time updates
    console.log('🔄 Setting up real-time updates...');
    await sdk.subscribeToPlayerUpdates(playerId);

    sdk.on('playerUpdate', (data) => {
      console.log('🔔 Player update received:', {
        playerId: data.playerId,
        lastUpdated: new Date(data.normalizedData.lastUpdated).toISOString()
      });
    });

    // Step 7: Monitor integration health
    console.log('🏥 Checking integration health...');
    const healthStatus = sdk.getIntegrationStatus();
    console.log('Health Status:', {
      connected: healthStatus.connected,
      lastSync: new Date(healthStatus.lastSync).toISOString(),
      errorCount: healthStatus.errors.length,
      totalSyncs: healthStatus.metrics.totalSyncs,
      successRate: `${((healthStatus.metrics.successfulSyncs / healthStatus.metrics.totalSyncs) * 100).toFixed(1)}%`
    });

    // Step 8: Demonstrate batch operations
    console.log('📦 Testing batch operations...');
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    const batchResults = await sdk.batchSyncPlayers(playerIds, 3); // Batch size of 3

    console.log('Batch Results:', {
      successful: batchResults.successful.length,
      failed: batchResults.failed.length,
      failedPlayers: batchResults.failed.map(f => f.playerId)
    });

    // Step 9: Get comprehensive diagnostics
    console.log('🔍 Getting diagnostic information...');
    const diagnostics = await sdk.getDiagnosticInfo();
    console.log('Diagnostics:', {
      sdkVersion: diagnostics.sdkVersion,
      environment: diagnostics.environment,
      uptime: `${Math.round(diagnostics.uptime / 1000)}s`,
      healthyChecks: diagnostics.healthChecks.filter(c => c.status === 'healthy').length,
      totalChecks: diagnostics.healthChecks.length
    });

    console.log('🎉 Basic integration example completed successfully!');

  } catch (error) {
    console.error('❌ Integration example failed:', error);
  } finally {
    // Step 10: Cleanup
    console.log('🧹 Shutting down SDK...');
    await sdk.shutdown();
    console.log('✅ SDK shutdown complete');
  }
}

// Error handling wrapper
async function runExample() {
  try {
    await basicIntegrationExample();
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runExample();
}

export { basicIntegrationExample };