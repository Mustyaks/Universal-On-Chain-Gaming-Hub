/**
 * Example concrete implementation of GameAdapter for a generic Dojo game
 * Demonstrates how to implement the abstract methods and integrate with Dojo contracts
 */

import { BaseGameAdapter, GameAdapterConfig, GameFeature } from '../GameAdapter';
import {
  StandardizedGameData,
  GameAsset,
  Achievement,
  GameStatistics,
  PlayerGameData
} from '../../../types/core';

export interface DojoGameConfig extends GameAdapterConfig {
  worldAddress: string;
  systemAddresses: {
    assets: string;
    achievements: string;
    player: string;
  };
}

export class DojoGameAdapter extends BaseGameAdapter {
  private dojoConfig: DojoGameConfig;
  private wsConnection: WebSocket | null = null;

  constructor(config: DojoGameConfig) {
    super(config);
    this.dojoConfig = config;
  }

  get version(): string {
    return '1.0.0';
  }

  get supportedFeatures(): GameFeature[] {
    return [
      'ASSETS',
      'ACHIEVEMENTS', 
      'STATISTICS',
      'REAL_TIME_UPDATES',
      'ASSET_TRADING'
    ];
  }

  /**
   * Normalize raw Dojo game data into standardized format
   */
  async normalize(rawData: any): Promise<StandardizedGameData> {
    const { player_id, assets, achievements, stats } = rawData;

    return {
      playerId: player_id,
      gameId: this.gameId,
      assets: this.normalizeAssets(assets || []),
      achievements: this.normalizeAchievements(achievements || []),
      statistics: this.normalizeStatistics(stats || {}),
      lastUpdated: Date.now()
    };
  }

  /**
   * Fetch raw player data from Dojo contracts
   */
  async fetchRawPlayerData(playerId: string): Promise<any> {
    // Simulate fetching data from multiple Dojo systems
    const [playerData, assetData, achievementData] = await Promise.all([
      this.fetchPlayerInfo(playerId),
      this.fetchPlayerAssets(playerId),
      this.fetchPlayerAchievements(playerId)
    ]);

    return {
      player_id: playerId,
      player_info: playerData,
      assets: assetData,
      achievements: achievementData,
      stats: playerData.stats || {}
    };
  }

  /**
   * Validate that an asset exists and belongs to the specified owner
   */
  async validateAsset(asset: GameAsset): Promise<boolean> {
    try {
      const onChainAsset = await this.fetchAssetFromContract(asset.tokenId);
      
      return (
        onChainAsset &&
        onChainAsset.owner === asset.owner &&
        onChainAsset.contract_address === asset.contractAddress
      );
    } catch (error) {
      console.error(`Asset validation failed for ${asset.id}:`, error);
      return false;
    }
  }

  /**
   * Connect to Dojo game's WebSocket for real-time updates
   */
  async connectToGameNetwork(): Promise<void> {
    if (!this.config.wsEndpoint) {
      throw new Error('WebSocket endpoint not configured');
    }

    return new Promise((resolve, reject) => {
      this.wsConnection = new WebSocket(this.config.wsEndpoint!);

      this.wsConnection.onopen = () => {
        console.log(`Connected to ${this.gameName} WebSocket`);
        
        // Subscribe to player data updates
        this.wsConnection!.send(JSON.stringify({
          type: 'subscribe',
          topics: ['player_updates', 'asset_transfers', 'achievements']
        }));
        
        resolve();
      };

      this.wsConnection.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };

      this.wsConnection.onerror = (error) => {
        console.error(`WebSocket error for ${this.gameName}:`, error);
        reject(error);
      };

      this.wsConnection.onclose = () => {
        console.log(`WebSocket connection closed for ${this.gameName}`);
        this.wsConnection = null;
      };
    });
  }

  /**
   * Disconnect from Dojo game's WebSocket
   */
  async disconnectFromGameNetwork(): Promise<void> {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  /**
   * Perform game-specific health check
   */
  protected async performHealthCheck(): Promise<void> {
    // Check if we can query the world contract
    const response = await fetch(this.config.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'starknet_call',
        params: [
          {
            contract_address: this.dojoConfig.worldAddress,
            entry_point_selector: 'get_world_info', // Example method
            calldata: []
          },
          'latest'
        ],
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`RPC error: ${result.error.message}`);
    }
  }

  // Private helper methods for fetching data from Dojo contracts

  private async fetchPlayerInfo(playerId: string): Promise<any> {
    const response = await fetch(this.config.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'starknet_call',
        params: [
          {
            contract_address: this.dojoConfig.systemAddresses.player,
            entry_point_selector: 'get_player',
            calldata: [playerId]
          },
          'latest'
        ],
        id: 1
      })
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Failed to fetch player info: ${result.error.message}`);
    }

    return this.parsePlayerData(result.result);
  }

  private async fetchPlayerAssets(playerId: string): Promise<any[]> {
    const response = await fetch(this.config.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'starknet_call',
        params: [
          {
            contract_address: this.dojoConfig.systemAddresses.assets,
            entry_point_selector: 'get_player_assets',
            calldata: [playerId]
          },
          'latest'
        ],
        id: 1
      })
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Failed to fetch player assets: ${result.error.message}`);
    }

    return this.parseAssetArray(result.result);
  }

  private async fetchPlayerAchievements(playerId: string): Promise<any[]> {
    const response = await fetch(this.config.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'starknet_call',
        params: [
          {
            contract_address: this.dojoConfig.systemAddresses.achievements,
            entry_point_selector: 'get_player_achievements',
            calldata: [playerId]
          },
          'latest'
        ],
        id: 1
      })
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Failed to fetch player achievements: ${result.error.message}`);
    }

    return this.parseAchievementArray(result.result);
  }

  private async fetchAssetFromContract(tokenId: string): Promise<any> {
    const response = await fetch(this.config.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'starknet_call',
        params: [
          {
            contract_address: this.dojoConfig.systemAddresses.assets,
            entry_point_selector: 'get_asset',
            calldata: [tokenId]
          },
          'latest'
        ],
        id: 1
      })
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Failed to fetch asset: ${result.error.message}`);
    }

    return this.parseAssetData(result.result);
  }

  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      
      if (message.type === 'player_update' && this.updateCallback) {
        // Convert WebSocket update to PlayerGameData format
        const playerData: PlayerGameData = {
          playerId: message.player_id,
          gameId: this.gameId,
          rawData: message.data,
          normalizedData: message.normalized_data,
          syncedAt: Date.now()
        };
        
        this.updateCallback(playerData);
      }
    } catch (error) {
      console.error(`Error handling WebSocket message for ${this.gameName}:`, error);
    }
  }

  // Data parsing helpers (convert from Cairo/Starknet format)

  private parsePlayerData(rawData: string[]): any {
    // Example parsing - adjust based on actual Dojo contract structure
    return {
      id: rawData[0],
      level: parseInt(rawData[1], 16),
      experience: parseInt(rawData[2], 16),
      stats: {
        playtime: parseInt(rawData[3], 16),
        score: parseInt(rawData[4], 16)
      }
    };
  }

  private parseAssetArray(rawData: string[]): any[] {
    const assets = [];
    
    // Assuming each asset takes 6 fields in the array
    for (let i = 0; i < rawData.length; i += 6) {
      assets.push({
        id: rawData[i],
        token_id: rawData[i + 1],
        contract_address: rawData[i + 2],
        owner: rawData[i + 3],
        asset_type: parseInt(rawData[i + 4], 16),
        tradeable: rawData[i + 5] === '1'
      });
    }
    
    return assets;
  }

  private parseAchievementArray(rawData: string[]): any[] {
    const achievements = [];
    
    // Assuming each achievement takes 5 fields in the array
    for (let i = 0; i < rawData.length; i += 5) {
      achievements.push({
        id: rawData[i],
        achievement_type: rawData[i + 1],
        rarity: parseInt(rawData[i + 2], 16),
        earned_at: parseInt(rawData[i + 3], 16),
        nft_badge_id: rawData[i + 4] !== '0' ? rawData[i + 4] : undefined
      });
    }
    
    return achievements;
  }

  private parseAssetData(rawData: string[]): any {
    return {
      id: rawData[0],
      token_id: rawData[1],
      contract_address: rawData[2],
      owner: rawData[3],
      asset_type: parseInt(rawData[4], 16),
      tradeable: rawData[5] === '1',
      metadata: rawData[6] ? JSON.parse(rawData[6]) : {}
    };
  }
}