/**
 * Testing integration example
 * Shows how to use the SDK testing utilities to validate integration
 */

import { DojoGameSDK, StandardDojoAdapter } from '../index';
import { IntegrationTester, MockDataGenerator } from '../testing';

async function testingIntegrationExample() {
  console.log('🧪 Starting Testing Integration Example');

  // Set up SDK with test configuration
  const sdk = new DojoGameSDK({
    hubEndpoint: 'https://api-staging.universalgaminghub.com',
    gameId: 'test-dojo-game',
    gameName: 'Test Dojo Game',
    environment: 'development'
  });

  const adapter = new StandardDojoAdapter({
    gameId: 'test-dojo-game',
    gameName: 'Test Dojo Game',
    contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
    rpcEndpoint: 'https://starknet-goerli.public.blastapi.io',
    wsEndpoint: 'wss://starknet-goerli.public.blastapi.io/ws',
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
      maxRetries: 2, // Lower for testing
      baseDelayMs: 500,
      maxDelayMs: 5000,
      backoffMultiplier: 2
    },
    cacheConfig: {
      ttlSeconds: 60, // Shorter for testing
      maxEntries: 100,
      enableCache: true
    }
  });

  try {
    // Initialize SDK
    console.log('🔧 Initializing SDK for testing...');
    await sdk.initialize(adapter);

    // Create integration tester
    const tester = new IntegrationTester(sdk);
    console.log('✅ Integration tester created');

    // Run full test suite
    console.log('🏃 Running full integration test suite...');
    const fullTestResults = await tester.runFullTestSuite();
    
    console.log('\n📊 Full Test Suite Results:');
    console.log(`Overall Status: ${fullTestResults.overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Total Duration: ${fullTestResults.totalDuration}ms`);
    console.log(`Tests Passed: ${fullTestResults.summary.passed}/${fullTestResults.tests.length}`);
    console.log(`Tests Failed: ${fullTestResults.summary.failed}`);
    console.log(`Warnings: ${fullTestResults.summary.warnings}`);

    // Show detailed results for failed tests
    const failedTests = fullTestResults.tests.filter(t => !t.passed);
    if (failedTests.length > 0) {
      console.log('\n❌ Failed Tests:');
      failedTests.forEach(test => {
        console.log(`  - ${test.testName}: ${test.details}`);
        if (test.errors) {
          test.errors.forEach(error => console.log(`    Error: ${error}`));
        }
      });
    }

    // Run specific test categories
    console.log('\n🔍 Running specific test categories...');

    // Connectivity tests
    const connectivityTests = await tester.runConnectivityTests();
    console.log(`Connectivity Tests: ${connectivityTests.filter(t => t.passed).length}/${connectivityTests.length} passed`);

    // Data validation tests
    const dataValidationTests = await tester.runDataValidationTests();
    console.log(`Data Validation Tests: ${dataValidationTests.filter(t => t.passed).length}/${dataValidationTests.length} passed`);

    // Performance tests
    const performanceTests = await tester.runPerformanceTests();
    console.log(`Performance Tests: ${performanceTests.filter(t => t.passed).length}/${performanceTests.length} passed`);

    // Error handling tests
    const errorHandlingTests = await tester.runErrorHandlingTests();
    console.log(`Error Handling Tests: ${errorHandlingTests.filter(t => t.passed).length}/${errorHandlingTests.length} passed`);

    // Real-time tests
    const realTimeTests = await tester.runRealTimeTests();
    console.log(`Real-time Tests: ${realTimeTests.filter(t => t.passed).length}/${realTimeTests.length} passed`);

    // Game-specific tests
    console.log('\n🎮 Running game-specific tests...');
    const gameSpecificTests = await tester.runGameSpecificTests('test-dojo-game');
    console.log(`Game-specific Tests: ${gameSpecificTests.filter(t => t.passed).length}/${gameSpecificTests.length} passed`);

    // Generate health report
    console.log('\n🏥 Generating health report...');
    const healthReport = await tester.generateHealthReport();
    console.log(`Overall Health: ${healthReport.overallHealth}`);
    console.log(`Health Checks: ${healthReport.healthChecks.filter(c => c.status === 'healthy').length}/${healthReport.healthChecks.length} healthy`);
    
    if (healthReport.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      healthReport.recommendations.forEach(rec => console.log(`  - ${rec}`));
    }

    // Demonstrate mock data generation
    console.log('\n🎭 Demonstrating mock data generation...');
    const mockGenerator = new MockDataGenerator();

    // Generate various types of test data
    const normalPlayerData = mockGenerator.generatePlayerData('test-dojo-game');
    console.log(`Generated normal player data: ${normalPlayerData.assets.length} assets, ${normalPlayerData.achievements.length} achievements`);

    const emptyPlayerData = mockGenerator.generateEmptyPlayerData();
    console.log(`Generated empty player data: ${emptyPlayerData.assets.length} assets, ${emptyPlayerData.achievements.length} achievements`);

    const largePlayerData = mockGenerator.generateLargePlayerData();
    console.log(`Generated large player data: ${largePlayerData.assets.length} assets, ${largePlayerData.achievements.length} achievements`);

    const specialCharPlayerData = mockGenerator.generatePlayerDataWithSpecialCharacters();
    console.log(`Generated special character data: ${specialCharPlayerData.assets[0]?.metadata.name || 'No assets'}`);

    // Test with generated data
    console.log('\n🔬 Testing with generated mock data...');
    
    // Test normal data
    const normalValidation = await sdk.validator.validateStandardizedData(normalPlayerData);
    console.log(`Normal data validation: ${normalValidation.valid ? '✅ Valid' : '❌ Invalid'}`);

    // Test empty data
    const emptyValidation = await sdk.validator.validateStandardizedData(emptyPlayerData);
    console.log(`Empty data validation: ${emptyValidation.valid ? '✅ Valid' : '❌ Invalid'}`);

    // Test large data
    const largeValidation = await sdk.validator.validateStandardizedData(largePlayerData);
    console.log(`Large data validation: ${largeValidation.valid ? '✅ Valid' : '❌ Invalid'}`);

    // Test malformed data
    const malformedData = mockGenerator.generateMalformedData();
    const malformedValidation = await sdk.validator.validateStandardizedData(malformedData as any);
    console.log(`Malformed data validation: ${malformedValidation.valid ? '⚠️ Unexpectedly valid' : '✅ Correctly invalid'}`);
    if (!malformedValidation.valid) {
      console.log(`  Errors found: ${malformedValidation.errors.length}`);
    }

    // Performance testing with mock data
    console.log('\n⚡ Performance testing with mock data...');
    const startTime = Date.now();
    
    // Generate and validate multiple datasets
    const testDatasets = Array.from({ length: 50 }, () => mockGenerator.generatePlayerData('test-dojo-game'));
    
    let validCount = 0;
    for (const dataset of testDatasets) {
      const validation = await sdk.validator.validateStandardizedData(dataset);
      if (validation.valid) validCount++;
    }
    
    const duration = Date.now() - startTime;
    console.log(`Validated ${testDatasets.length} datasets in ${duration}ms (${validCount} valid)`);
    console.log(`Average validation time: ${(duration / testDatasets.length).toFixed(2)}ms per dataset`);

    // Asset validation testing
    console.log('\n🎯 Testing asset validation...');
    const testAsset = mockGenerator.generateAsset('test-dojo-game');
    const assetValidation = await sdk.validateAsset(testAsset);
    console.log(`Asset validation: ${assetValidation ? '✅ Valid' : '❌ Invalid'}`);

    // Game-specific asset testing
    const gameSpecificAssets = mockGenerator.generateGameSpecificAssets('test-dojo-game');
    console.log(`Generated ${gameSpecificAssets.length} game-specific assets`);
    
    for (const asset of gameSpecificAssets) {
      const isValid = await sdk.validateAsset(asset);
      console.log(`  ${asset.metadata.name} (${asset.assetType}): ${isValid ? '✅' : '❌'}`);
    }

    // Achievement testing
    const gameSpecificAchievements = mockGenerator.generateGameSpecificAchievements('test-dojo-game');
    console.log(`Generated ${gameSpecificAchievements.length} game-specific achievements`);
    
    for (const achievement of gameSpecificAchievements) {
      console.log(`  ${achievement.title} (${achievement.rarity}): ${achievement.description}`);
    }

    // Configuration validation testing
    console.log('\n⚙️ Testing configuration validation...');
    const configValidation = await sdk.validator.validateConfig(sdk.config);
    console.log(`SDK configuration: ${configValidation.valid ? '✅ Valid' : '❌ Invalid'}`);
    
    if (configValidation.warnings.length > 0) {
      console.log('Configuration warnings:');
      configValidation.warnings.forEach(warning => console.log(`  - ${warning.message}`));
    }

    // Integration status monitoring
    console.log('\n📈 Integration status monitoring...');
    const integrationStatus = sdk.getIntegrationStatus();
    console.log('Integration Status:', {
      connected: integrationStatus.connected,
      lastSync: new Date(integrationStatus.lastSync).toISOString(),
      totalSyncs: integrationStatus.metrics.totalSyncs,
      successfulSyncs: integrationStatus.metrics.successfulSyncs,
      failedSyncs: integrationStatus.metrics.failedSyncs,
      averageResponseTime: `${integrationStatus.metrics.averageResponseTime.toFixed(2)}ms`,
      errorCount: integrationStatus.errors.length
    });

    // Final diagnostic report
    console.log('\n📋 Final diagnostic report...');
    const diagnostics = await sdk.getDiagnosticInfo();
    console.log('Diagnostic Summary:', {
      sdkVersion: diagnostics.sdkVersion,
      gameId: diagnostics.gameId,
      environment: diagnostics.environment,
      uptime: `${Math.round(diagnostics.uptime / 1000)}s`,
      healthChecks: {
        healthy: diagnostics.healthChecks.filter(c => c.status === 'healthy').length,
        degraded: diagnostics.healthChecks.filter(c => c.status === 'degraded').length,
        unhealthy: diagnostics.healthChecks.filter(c => c.status === 'unhealthy').length
      }
    });

    console.log('\n🎉 Testing integration example completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`- Full test suite: ${fullTestResults.overallPassed ? 'PASSED' : 'FAILED'}`);
    console.log(`- Health status: ${healthReport.overallHealth.toUpperCase()}`);
    console.log(`- Mock data generation: Working`);
    console.log(`- Data validation: Working`);
    console.log(`- Performance: ${duration < 5000 ? 'Good' : 'Needs improvement'}`);

  } catch (error) {
    console.error('❌ Testing integration example failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await sdk.shutdown();
    console.log('✅ Cleanup complete');
  }
}

// Export for use in other examples
export { testingIntegrationExample };

// Run the example if this file is executed directly
if (require.main === module) {
  testingIntegrationExample().catch(console.error);
}