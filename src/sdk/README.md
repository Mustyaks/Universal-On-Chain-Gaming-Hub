# Universal Gaming Hub SDK

The Universal Gaming Hub SDK provides an easy-to-use interface for Dojo game developers to integrate their games with the Universal Gaming Hub platform. This SDK handles data normalization, real-time synchronization, and provides comprehensive testing tools.

## Features

- 🎮 **Easy Integration**: Simple API for connecting Dojo games to the Universal Gaming Hub
- 🔄 **Real-time Sync**: Automatic synchronization of player data, assets, and achievements
- 🛡️ **Data Validation**: Built-in validation for game data structures
- 🧪 **Testing Tools**: Comprehensive testing utilities for validating integration
- 📊 **Health Monitoring**: Built-in health checks and diagnostics
- 🔌 **Plugin System**: Extensible adapter system for different game types
- 📚 **TypeScript Support**: Full TypeScript support with comprehensive type definitions

## Quick Start

### Installation

```bash
npm install @universal-gaming-hub/sdk
```

### Basic Usage

```typescript
import { DojoGameSDK, StandardDojoAdapter } from '@universal-gaming-hub/sdk';

// Configure the SDK
const sdk = new DojoGameSDK({
  hubEndpoint: 'https://api.universalgaminghub.com',
  gameId: 'my-dojo-game',
  gameName: 'My Awesome Dojo Game',
  environment: 'production',
  apiKey: 'your-api-key'
});

// Create and configure adapter
const adapter = new StandardDojoAdapter({
  gameId: 'my-dojo-game',
  gameName: 'My Awesome Dojo Game',
  contractAddress: '0x...',
  rpcEndpoint: 'https://starknet-mainnet.public.blastapi.io',
  wsEndpoint: 'wss://starknet-mainnet.public.blastapi.io/ws',
  worldAddress: '0x...',
  systemAddresses: {
    player: '0x...',
    assets: '0x...',
    achievements: '0x...'
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

// Initialize the SDK
await sdk.initialize(adapter);

// Sync player data
const playerData = await sdk.syncPlayerData('player-123');
console.log('Player data synced:', playerData);

// Subscribe to real-time updates
await sdk.subscribeToPlayerUpdates('player-123');

sdk.on('playerUpdate', (data) => {
  console.log('Player updated:', data);
});
```

## Configuration

### SDK Configuration

```typescript
interface SDKConfig {
  hubEndpoint: string;           // Universal Gaming Hub API endpoint
  gameId: string;               // Unique identifier for your game
  gameName: string;             // Display name for your game
  apiKey?: string;              // API key for authentication (recommended for production)
  environment: 'development' | 'staging' | 'production';
  retryConfig?: RetryConfig;    // Retry configuration for failed requests
  cacheConfig?: CacheConfig;    // Caching configuration
}
```

### Adapter Configuration

The SDK supports different types of adapters for various Dojo game patterns:

#### StandardDojoAdapter

For games following standard Dojo patterns:

```typescript
const adapter = new StandardDojoAdapter({
  gameId: 'my-game',
  gameName: 'My Game',
  contractAddress: '0x...',
  rpcEndpoint: 'https://starknet-mainnet.public.blastapi.io',
  wsEndpoint: 'wss://starknet-mainnet.public.blastapi.io/ws',
  worldAddress: '0x...',
  systemAddresses: {
    player: '0x...',
    assets: '0x...',
    achievements: '0x...'
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
```

#### Custom Adapter

For games with custom requirements, extend the BasePluginAdapter:

```typescript
import { BasePluginAdapter } from '@universal-gaming-hub/sdk';

class MyCustomAdapter extends BasePluginAdapter {
  async fetchRawPlayerData(playerId: string): Promise<any> {
    // Implement your custom data fetching logic
    return await this.fetchFromCustomAPI(playerId);
  }

  async connectToGameNetwork(): Promise<void> {
    // Implement your custom connection logic
  }

  async disconnectFromGameNetwork(): Promise<void> {
    // Implement your custom disconnection logic
  }

  protected async performAssetValidation(asset: GameAsset): Promise<boolean> {
    // Implement your custom asset validation
    return true;
  }
}
```

## Data Models

The SDK uses standardized data models for cross-game compatibility:

### StandardizedGameData

```typescript
interface StandardizedGameData {
  playerId: string;
  gameId: string;
  assets: GameAsset[];
  achievements: Achievement[];
  statistics: GameStatistics;
  lastUpdated: number;
}
```

### GameAsset

```typescript
interface GameAsset {
  id: string;
  gameId: string;
  tokenId: string;
  contractAddress: string;
  assetType: 'NFT' | 'CURRENCY' | 'ITEM';
  metadata: AssetMetadata;
  owner: string;
  tradeable: boolean;
}
```

### Achievement

```typescript
interface Achievement {
  id: string;
  gameId: string;
  playerId: string;
  achievementType: string;
  title: string;
  description: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  earnedAt: number;
  nftBadgeId?: string;
}
```

## Testing Your Integration

The SDK includes comprehensive testing tools:

### Integration Testing

```typescript
import { IntegrationTester } from '@universal-gaming-hub/sdk/testing';

const tester = new IntegrationTester(sdk);

// Run full test suite
const testResults = await tester.runFullTestSuite();
console.log('Test Results:', testResults);

// Run specific test categories
const connectivityTests = await tester.runConnectivityTests();
const dataValidationTests = await tester.runDataValidationTests();
const performanceTests = await tester.runPerformanceTests();

// Generate health report
const healthReport = await tester.generateHealthReport();
console.log('Health Report:', healthReport);
```

### Mock Data Generation

```typescript
import { MockDataGenerator } from '@universal-gaming-hub/sdk/testing';

const mockGenerator = new MockDataGenerator();

// Generate test player data
const playerData = mockGenerator.generatePlayerData('my-game');

// Generate specific asset types
const assets = mockGenerator.generateGameSpecificAssets('my-game');

// Generate edge case data
const emptyData = mockGenerator.generateEmptyPlayerData();
const largeData = mockGenerator.generateLargePlayerData();
```

## Health Monitoring

Monitor your integration health:

```typescript
// Get current integration status
const status = sdk.getIntegrationStatus();
console.log('Integration Status:', status);

// Get diagnostic information
const diagnostics = await sdk.getDiagnosticInfo();
console.log('Diagnostics:', diagnostics);

// Listen for health events
sdk.on('error', (error) => {
  console.error('SDK Error:', error);
});

sdk.on('disconnected', () => {
  console.warn('SDK Disconnected');
});
```

## Event System

The SDK provides a comprehensive event system:

```typescript
// Player data events
sdk.on('playerUpdate', (data) => {
  console.log('Player updated:', data);
});

sdk.on('dataSync', (data) => {
  console.log('Data synced:', data);
});

// Connection events
sdk.on('connected', () => {
  console.log('SDK connected');
});

sdk.on('disconnected', () => {
  console.log('SDK disconnected');
});

// Error events
sdk.on('error', (error) => {
  console.error('SDK error:', error);
});
```

## Advanced Features

### Batch Operations

```typescript
// Batch sync multiple players
const playerIds = ['player-1', 'player-2', 'player-3'];
const results = await sdk.batchSyncPlayers(playerIds, 5); // Batch size of 5

console.log('Successful syncs:', results.successful.length);
console.log('Failed syncs:', results.failed.length);
```

### Webhooks

```typescript
// Configure webhooks for external notifications
await sdk.configureWebhook({
  url: 'https://your-game.com/webhooks/hub',
  events: ['playerUpdate', 'achievementEarned'],
  secret: 'your-webhook-secret'
});
```

### Custom Validation

```typescript
import { DataValidator } from '@universal-gaming-hub/sdk/utils';

const validator = new DataValidator();

// Validate player data
const validationResult = await validator.validateStandardizedData(playerData);

if (!validationResult.valid) {
  console.error('Validation errors:', validationResult.errors);
  console.warn('Validation warnings:', validationResult.warnings);
}
```

## Best Practices

### 1. Error Handling

Always implement proper error handling:

```typescript
try {
  await sdk.syncPlayerData(playerId);
} catch (error) {
  console.error('Sync failed:', error);
  // Implement retry logic or fallback behavior
}
```

### 2. Rate Limiting

Be mindful of rate limits when syncing large amounts of data:

```typescript
// Use batch operations for multiple players
const results = await sdk.batchSyncPlayers(playerIds, 10);

// Implement delays between requests if needed
await new Promise(resolve => setTimeout(resolve, 1000));
```

### 3. Data Validation

Always validate data before syncing:

```typescript
const validationResult = await sdk.testIntegration();
if (!validationResult.valid) {
  console.error('Integration test failed:', validationResult.errors);
  return;
}

await sdk.syncPlayerData(playerId);
```

### 4. Health Monitoring

Implement health monitoring in production:

```typescript
// Set up periodic health checks
setInterval(async () => {
  const health = await sdk.getDiagnosticInfo();
  if (health.integrationStatus.errors.length > 0) {
    console.warn('Integration issues detected:', health.integrationStatus.errors);
  }
}, 60000); // Check every minute
```

### 5. Graceful Shutdown

Always shutdown the SDK properly:

```typescript
process.on('SIGINT', async () => {
  console.log('Shutting down SDK...');
  await sdk.shutdown();
  process.exit(0);
});
```

## Troubleshooting

### Common Issues

1. **Connection Failures**
   - Verify your RPC endpoint is accessible
   - Check your contract addresses are correct
   - Ensure your API key is valid (if using one)

2. **Data Validation Errors**
   - Use the testing tools to identify data structure issues
   - Check that your data matches the expected schemas
   - Verify asset ownership and contract addresses

3. **Performance Issues**
   - Enable caching to reduce API calls
   - Use batch operations for multiple players
   - Monitor response times and adjust retry settings

4. **WebSocket Issues**
   - Verify your WebSocket endpoint is accessible
   - Check that event topics are correctly configured
   - Monitor connection status and implement reconnection logic

### Debug Mode

Enable debug logging for troubleshooting:

```typescript
// Set environment variable
process.env.DEBUG = 'universal-gaming-hub:*';

// Or enable programmatically
sdk.setLogLevel('debug');
```

## Support

- 📖 [Full Documentation](https://docs.universalgaminghub.com)
- 🐛 [Report Issues](https://github.com/universal-gaming-hub/sdk/issues)
- 💬 [Discord Community](https://discord.gg/universalgaminghub)
- 📧 [Email Support](mailto:support@universalgaminghub.com)

## License

MIT License - see [LICENSE](LICENSE) file for details.