/**
 * Custom adapter example
 * Shows how to create a custom adapter for games with unique requirements
 */

import { BasePluginAdapter } from '../adapters/BasePluginAdapter';
import { GameAdapterConfig } from '../../services/aggregation/GameAdapter';
import { StandardizedGameData, GameAsset } from '../../types/core';
import { DojoGameSDK } from '../DojoGameSDK';

// Custom configuration interface extending the base config
interface CustomGameConfig extends GameAdapterConfig {
  customApiEndpoint: string;
  authToken: string;
  gameSpecificSettings: {
    enableSpecialFeatures: boolean;
    customDataFormat: 'json' | 'xml' | 'binary';
    compressionEnabled: boolean;
  };
}

/**
 * Custom adapter for a hypothetical game with unique data structures
 */
class CustomGameAdapter extends BasePluginAdapter {
  private customConfig: CustomGameConfig;
  private authHeaders: Record<string, string>;

  constructor(config: CustomGameConfig) {
    super(config);
    this.customConfig = config;
    this.authHeaders = {
      'Authorization': `Bearer ${config.authToken}`,
      'Content-Type': 'application/json',
      'X-Game-Version': '2.0'
    };
  }

  get version(): string {
    return '2.0.0';
  }

  get supportedFeatures() {
    return [
      'ASSETS' as const,
      'ACHIEVEMENTS' as const,
      'STATISTICS' as const,
      'REAL_TIME_UPDATES' as const,
      'ASSET_TRADING' as const
    ];
  }

  /**
   * Initialize custom game connection
   */
  protected async initializeGameConnection(): Promise<void> {
    try {
      // Custom initialization logic
      console.log('Initializing custom game connection...');
      
      // Verify custom API endpoint
      const response = await fetch(`${this.customConfig.customApiEndpoint}/health`, {
        headers: this.authHeaders
      });

      if (!response.ok) {
        throw new Error(`Custom API health check failed: ${response.status}`);
      }

      // Initialize special features if enabled
      if (this.customConfig.gameSpecificSettings.enableSpecialFeatures) {
        await this.initializeSpecialFeatures();
      }

      console.log('Custom game connection initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize custom game connection: ${error}`);
    }
  }

  /**
   * Fetch raw player data from custom API
   */
  async fetchRawPlayerData(playerId: string): Promise<any> {
    try {
      console.log(`Fetching custom player data for: ${playerId}`);

      // Fetch from custom API endpoint
      const response = await fetch(
        `${this.customConfig.customApiEndpoint}/players/${playerId}/data`,
        {
          headers: this.authHeaders
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch player data: ${response.status} ${response.statusText}`);
      }

      let rawData = await response.json();

      // Handle custom data format
      if (this.customConfig.gameSpecificSettings.customDataFormat === 'xml') {
        rawData = await this.parseXMLData(rawData);
      } else if (this.customConfig.gameSpecificSettings.customDataFormat === 'binary') {
        rawData = await this.parseBinaryData(rawData);
      }

      // Decompress if needed
      if (this.customConfig.gameSpecificSettings.compressionEnabled) {
        rawData = await this.decompressData(rawData);
      }

      return rawData;
    } catch (error) {
      throw new Error(`Failed to fetch raw player data: ${error}`);
    }
  }

  /**
   * Custom normalization logic for unique data structures
   */
  protected async performNormalization(rawData: any): Promise<StandardizedGameData> {
    try {
      console.log('Performing custom data normalization...');

      // Handle custom data structure
      const customPlayerData = rawData.playerInfo || rawData;
      const customAssets = rawData.inventory?.items || [];
      const customAchievements = rawData.progressData?.achievements || [];
      const customStats = rawData.gameStats || {};

      // Normalize assets with custom logic
      const normalizedAssets = await this.normalizeCustomAssets(customAssets);

      // Normalize achievements with custom logic
      const normalizedAchievements = await this.normalizeCustomAchievements(customAchievements, customPlayerData.id);

      // Normalize statistics with custom logic
      const normalizedStats = await this.normalizeCustomStatistics(customStats, customPlayerData.id);

      return {
        playerId: customPlayerData.id || customPlayerData.player_id,
        gameId: this.gameId,
        assets: normalizedAssets,
        achievements: normalizedAchievements,
        statistics: normalizedStats,
        lastUpdated: customPlayerData.lastModified || Date.now()
      };
    } catch (error) {
      throw new Error(`Custom normalization failed: ${error}`);
    }
  }

  /**
   * Custom asset validation with game-specific rules
   */
  protected async performAssetValidation(asset: GameAsset): Promise<boolean> {
    try {
      // Basic validation
      if (!asset.id || !asset.tokenId || !asset.owner) {
        return false;
      }

      // Custom validation: Check with game's asset registry
      const response = await fetch(
        `${this.customConfig.customApiEndpoint}/assets/${asset.tokenId}/validate`,
        {
          method: 'POST',
          headers: this.authHeaders,
          body: JSON.stringify({
            assetId: asset.id,
            owner: asset.owner,
            contractAddress: asset.contractAddress
          })
        }
      );

      if (!response.ok) {
        console.warn(`Asset validation API call failed: ${response.status}`);
        return false;
      }

      const validationResult = await response.json();
      return validationResult.isValid === true;
    } catch (error) {
      console.error(`Asset validation error: ${error}`);
      return false;
    }
  }

  /**
   * Connect to custom game's real-time system
   */
  async connectToGameNetwork(): Promise<void> {
    if (!this.config.wsEndpoint) {
      console.warn('WebSocket endpoint not configured for custom game');
      return;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.wsEndpoint!, [], {
        headers: this.authHeaders
      } as any);

      ws.onopen = () => {
        console.log('Connected to custom game WebSocket');
        
        // Send custom authentication message
        ws.send(JSON.stringify({
          type: 'authenticate',
          token: this.customConfig.authToken,
          gameId: this.gameId
        }));

        // Subscribe to custom events
        ws.send(JSON.stringify({
          type: 'subscribe',
          events: [
            'player.data.updated',
            'inventory.item.added',
            'inventory.item.removed',
            'achievement.unlocked',
            'stats.updated'
          ]
        }));
        
        resolve();
      };

      ws.onmessage = (event) => {
        this.handleCustomWebSocketMessage(event);
      };

      ws.onerror = (error) => {
        console.error(`Custom game WebSocket error:`, error);
        reject(error);
      };

      ws.onclose = () => {
        console.log('Custom game WebSocket connection closed');
      };
    });
  }

  /**
   * Disconnect from custom game's WebSocket
   */
  async disconnectFromGameNetwork(): Promise<void> {
    console.log('Disconnecting from custom game network');
    // Custom disconnection logic would go here
  }

  // Private helper methods for custom functionality

  private async initializeSpecialFeatures(): Promise<void> {
    console.log('Initializing special features...');
    
    // Custom feature initialization
    const response = await fetch(
      `${this.customConfig.customApiEndpoint}/features/initialize`,
      {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({
          gameId: this.gameId,
          features: ['advanced_analytics', 'real_time_leaderboards', 'custom_events']
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to initialize special features: ${response.status}`);
    }

    console.log('Special features initialized successfully');
  }

  private async parseXMLData(data: any): Promise<any> {
    // Simulate XML parsing
    console.log('Parsing XML data format...');
    return data; // In real implementation, would parse XML
  }

  private async parseBinaryData(data: any): Promise<any> {
    // Simulate binary data parsing
    console.log('Parsing binary data format...');
    return data; // In real implementation, would parse binary data
  }

  private async decompressData(data: any): Promise<any> {
    // Simulate data decompression
    console.log('Decompressing data...');
    return data; // In real implementation, would decompress data
  }

  private async normalizeCustomAssets(customAssets: any[]): Promise<GameAsset[]> {
    return customAssets.map(item => ({
      id: item.itemId || item.id,
      gameId: this.gameId,
      tokenId: item.tokenId || item.nftId || item.id,
      contractAddress: item.contractAddr || this.config.contractAddress,
      assetType: this.mapCustomAssetType(item.category),
      metadata: {
        name: item.displayName || item.name,
        description: item.desc || item.description || '',
        image: item.imageUrl || item.icon || '',
        attributes: this.mapCustomAttributes(item.properties || item.stats || []),
        rarity: this.mapCustomRarity(item.rarity || item.tier)
      },
      owner: item.ownerId || item.owner,
      tradeable: item.canTrade !== false
    }));
  }

  private async normalizeCustomAchievements(customAchievements: any[], playerId: string) {
    return customAchievements.map(ach => ({
      id: ach.achievementId || ach.id,
      gameId: this.gameId,
      playerId: playerId,
      achievementType: ach.category || ach.type,
      title: ach.displayName || ach.title,
      description: ach.desc || ach.description || '',
      rarity: this.mapCustomRarity(ach.difficulty || ach.rarity),
      earnedAt: ach.unlockedAt || ach.timestamp || Date.now(),
      nftBadgeId: ach.badgeNftId
    }));
  }

  private async normalizeCustomStatistics(customStats: any, playerId: string) {
    return {
      gameId: this.gameId,
      playerId: playerId,
      playtime: customStats.totalPlayTime || customStats.playtime || 0,
      level: customStats.playerLevel || customStats.level || 1,
      score: customStats.totalScore || customStats.score || 0,
      customStats: {
        ...customStats,
        // Add any game-specific stats
        customMetric1: customStats.specialStat1 || 0,
        customMetric2: customStats.specialStat2 || 0
      }
    };
  }

  private mapCustomAssetType(customType: string): 'NFT' | 'CURRENCY' | 'ITEM' {
    const typeMap: Record<string, 'NFT' | 'CURRENCY' | 'ITEM'> = {
      'unique_item': 'NFT',
      'collectible': 'NFT',
      'currency': 'CURRENCY',
      'coin': 'CURRENCY',
      'token': 'CURRENCY',
      'consumable': 'ITEM',
      'equipment': 'ITEM',
      'tool': 'ITEM'
    };

    return typeMap[customType?.toLowerCase()] || 'ITEM';
  }

  private mapCustomRarity(customRarity: string): 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' {
    const rarityMap: Record<string, 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'> = {
      'basic': 'COMMON',
      'normal': 'COMMON',
      'uncommon': 'RARE',
      'rare': 'RARE',
      'epic': 'EPIC',
      'legendary': 'LEGENDARY',
      'mythic': 'LEGENDARY',
      '1': 'COMMON',
      '2': 'RARE',
      '3': 'EPIC',
      '4': 'LEGENDARY'
    };

    return rarityMap[customRarity?.toLowerCase()] || 'COMMON';
  }

  private mapCustomAttributes(customProps: any[]): Array<{ trait_type: string; value: string | number }> {
    return customProps.map(prop => ({
      trait_type: prop.name || prop.key || prop.trait_type,
      value: prop.value || prop.val
    }));
  }

  private handleCustomWebSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'player.data.updated':
          this.handlePlayerDataUpdate(message);
          break;
        case 'inventory.item.added':
        case 'inventory.item.removed':
          this.handleInventoryChange(message);
          break;
        case 'achievement.unlocked':
          this.handleAchievementUnlocked(message);
          break;
        case 'stats.updated':
          this.handleStatsUpdate(message);
          break;
        default:
          console.log('Unknown custom message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling custom WebSocket message:', error);
    }
  }

  private async handlePlayerDataUpdate(message: any): Promise<void> {
    if (this.updateCallback && message.playerId) {
      try {
        const playerData = await this.fetchPlayerData(message.playerId);
        this.updateCallback(playerData);
      } catch (error) {
        console.error('Failed to handle player data update:', error);
      }
    }
  }

  private async handleInventoryChange(message: any): Promise<void> {
    console.log('Inventory change detected:', message);
    await this.handlePlayerDataUpdate(message);
  }

  private async handleAchievementUnlocked(message: any): Promise<void> {
    console.log('Achievement unlocked:', message);
    await this.handlePlayerDataUpdate(message);
  }

  private async handleStatsUpdate(message: any): Promise<void> {
    console.log('Stats updated:', message);
    await this.handlePlayerDataUpdate(message);
  }
}

// Example usage of the custom adapter
async function customAdapterExample() {
  console.log('🎮 Starting Custom Adapter Example');

  // Create SDK with custom configuration
  const sdk = new DojoGameSDK({
    hubEndpoint: 'https://api.universalgaminghub.com',
    gameId: 'custom-dojo-game',
    gameName: 'Custom Dojo Game',
    environment: 'development'
  });

  // Create custom adapter with game-specific configuration
  const customAdapter = new CustomGameAdapter({
    gameId: 'custom-dojo-game',
    gameName: 'Custom Dojo Game',
    contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
    rpcEndpoint: 'https://starknet-mainnet.public.blastapi.io',
    wsEndpoint: 'wss://custom-game.com/ws',
    customApiEndpoint: 'https://api.custom-game.com/v2',
    authToken: process.env.CUSTOM_GAME_TOKEN || 'demo-token',
    gameSpecificSettings: {
      enableSpecialFeatures: true,
      customDataFormat: 'json',
      compressionEnabled: false
    },
    retryConfig: {
      maxRetries: 5, // Higher retry count for custom API
      baseDelayMs: 2000,
      maxDelayMs: 30000,
      backoffMultiplier: 2
    },
    cacheConfig: {
      ttlSeconds: 600, // Longer cache for custom data
      maxEntries: 2000,
      enableCache: true
    }
  });

  try {
    // Initialize with custom adapter
    await sdk.initialize(customAdapter);
    console.log('✅ Custom adapter initialized successfully');

    // Test custom integration
    const testResult = await sdk.testIntegration();
    console.log('Custom integration test result:', testResult.valid ? '✅ Passed' : '❌ Failed');

    // Sync player data using custom adapter
    const playerData = await sdk.syncPlayerData('custom-player-123');
    console.log('✅ Custom player data synced:', {
      playerId: playerData.playerId,
      customAssets: playerData.assets.length,
      customAchievements: playerData.achievements.length
    });

    console.log('🎉 Custom adapter example completed successfully!');

  } catch (error) {
    console.error('❌ Custom adapter example failed:', error);
  } finally {
    await sdk.shutdown();
  }
}

// Export for use in other examples
export { CustomGameAdapter, customAdapterExample };