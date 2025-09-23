/**
 * Standard Dojo game adapter for common Dojo game patterns
 * Provides out-of-the-box integration for standard Dojo games
 */

import { BasePluginAdapter } from './BasePluginAdapter';
import { GameAdapterConfig } from '../../services/aggregation/GameAdapter';
import { StandardizedGameData, GameAsset } from '../../types/core';

export interface StandardDojoConfig extends GameAdapterConfig {
  worldAddress: string;
  systemAddresses: {
    player: string;
    assets: string;
    achievements: string;
  };
  eventTopics: {
    playerUpdate: string;
    assetTransfer: string;
    achievementEarned: string;
  };
}

export class StandardDojoAdapter extends BasePluginAdapter {
  private dojoConfig: StandardDojoConfig;

  constructor(config: StandardDojoConfig) {
    super(config);
    this.dojoConfig = config;
  }

  get version(): string {
    return '1.0.0';
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
   * Initialize connection to Dojo game
   */
  protected async initializeGameConnection(): Promise<void> {
    try {
      // Verify world contract is accessible
      await this.verifyWorldContract();
      
      // Verify system contracts
      await this.verifySystemContracts();
      
      console.log(`StandardDojoAdapter connected to ${this.gameName}`);
    } catch (error) {
      throw new Error(`Failed to connect to Dojo game: ${error}`);
    }
  }

  /**
   * Fetch raw player data from Dojo contracts
   */
  async fetchRawPlayerData(playerId: string): Promise<any> {
    try {
      const [playerInfo, assets, achievements] = await Promise.all([
        this.fetchPlayerInfo(playerId),
        this.fetchPlayerAssets(playerId),
        this.fetchPlayerAchievements(playerId)
      ]);

      return {
        player_id: playerId,
        player_info: playerInfo,
        assets: assets,
        achievements: achievements,
        stats: playerInfo.stats || {}
      };
    } catch (error) {
      throw new Error(`Failed to fetch player data: ${error}`);
    }
  }

  /**
   * Enhanced asset validation for Dojo games
   */
  protected async performAssetValidation(asset: GameAsset): Promise<boolean> {
    try {
      // Check if asset exists on-chain
      const onChainAsset = await this.fetchAssetFromContract(asset.tokenId);
      
      if (!onChainAsset) {
        return false;
      }
      
      // Verify ownership
      if (onChainAsset.owner !== asset.owner) {
        return false;
      }
      
      // Verify contract address
      if (onChainAsset.contract_address !== asset.contractAddress) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Asset validation error: ${error}`);
      return false;
    }
  }

  /**
   * Connect to Dojo game's real-time updates
   */
  async connectToGameNetwork(): Promise<void> {
    if (!this.config.wsEndpoint) {
      console.warn('WebSocket endpoint not configured, real-time updates disabled');
      return;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.wsEndpoint!);

      ws.onopen = () => {
        console.log(`Connected to ${this.gameName} WebSocket`);
        
        // Subscribe to relevant events
        ws.send(JSON.stringify({
          type: 'subscribe',
          topics: [
            this.dojoConfig.eventTopics.playerUpdate,
            this.dojoConfig.eventTopics.assetTransfer,
            this.dojoConfig.eventTopics.achievementEarned
          ]
        }));
        
        resolve();
      };

      ws.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };

      ws.onerror = (error) => {
        console.error(`WebSocket error for ${this.gameName}:`, error);
        reject(error);
      };

      ws.onclose = () => {
        console.log(`WebSocket connection closed for ${this.gameName}`);
      };
    });
  }

  /**
   * Disconnect from Dojo game's WebSocket
   */
  async disconnectFromGameNetwork(): Promise<void> {
    // WebSocket cleanup handled by base class
    console.log(`Disconnected from ${this.gameName}`);
  }

  // Private helper methods for Dojo contract interactions

  private async verifyWorldContract(): Promise<void> {
    const response = await this.makeStarknetCall(
      this.dojoConfig.worldAddress,
      'get_world_info',
      []
    );
    
    if (!response || response.error) {
      throw new Error('World contract not accessible');
    }
  }

  private async verifySystemContracts(): Promise<void> {
    const systems = [
      this.dojoConfig.systemAddresses.player,
      this.dojoConfig.systemAddresses.assets,
      this.dojoConfig.systemAddresses.achievements
    ];

    for (const systemAddress of systems) {
      try {
        await this.makeStarknetCall(systemAddress, 'get_system_info', []);
      } catch (error) {
        throw new Error(`System contract ${systemAddress} not accessible`);
      }
    }
  }

  private async fetchPlayerInfo(playerId: string): Promise<any> {
    const response = await this.makeStarknetCall(
      this.dojoConfig.systemAddresses.player,
      'get_player',
      [playerId]
    );

    if (response.error) {
      throw new Error(`Failed to fetch player info: ${response.error.message}`);
    }

    return this.parsePlayerData(response.result);
  }

  private async fetchPlayerAssets(playerId: string): Promise<any[]> {
    const response = await this.makeStarknetCall(
      this.dojoConfig.systemAddresses.assets,
      'get_player_assets',
      [playerId]
    );

    if (response.error) {
      throw new Error(`Failed to fetch player assets: ${response.error.message}`);
    }

    return this.parseAssetArray(response.result);
  }

  private async fetchPlayerAchievements(playerId: string): Promise<any[]> {
    const response = await this.makeStarknetCall(
      this.dojoConfig.systemAddresses.achievements,
      'get_player_achievements',
      [playerId]
    );

    if (response.error) {
      throw new Error(`Failed to fetch player achievements: ${response.error.message}`);
    }

    return this.parseAchievementArray(response.result);
  }

  private async fetchAssetFromContract(tokenId: string): Promise<any> {
    const response = await this.makeStarknetCall(
      this.dojoConfig.systemAddresses.assets,
      'get_asset',
      [tokenId]
    );

    if (response.error) {
      throw new Error(`Failed to fetch asset: ${response.error.message}`);
    }

    return this.parseAssetData(response.result);
  }

  private async makeStarknetCall(
    contractAddress: string,
    entryPoint: string,
    calldata: string[]
  ): Promise<any> {
    const response = await fetch(this.config.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'starknet_call',
        params: [
          {
            contract_address: contractAddress,
            entry_point_selector: entryPoint,
            calldata: calldata
          },
          'latest'
        ],
        id: 1
      })
    });

    return await response.json();
  }

  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      
      if (message.type === 'player_update' && this.updateCallback) {
        this.processPlayerUpdate(message);
      } else if (message.type === 'asset_transfer' && this.updateCallback) {
        this.processAssetTransfer(message);
      } else if (message.type === 'achievement_earned' && this.updateCallback) {
        this.processAchievementEarned(message);
      }
    } catch (error) {
      console.error(`Error handling WebSocket message: ${error}`);
    }
  }

  private async processPlayerUpdate(message: any): Promise<void> {
    try {
      const playerData = await this.fetchPlayerData(message.player_id);
      if (this.updateCallback) {
        this.updateCallback(playerData);
      }
    } catch (error) {
      console.error(`Failed to process player update: ${error}`);
    }
  }

  private async processAssetTransfer(message: any): Promise<void> {
    try {
      const playerData = await this.fetchPlayerData(message.player_id);
      if (this.updateCallback) {
        this.updateCallback(playerData);
      }
    } catch (error) {
      console.error(`Failed to process asset transfer: ${error}`);
    }
  }

  private async processAchievementEarned(message: any): Promise<void> {
    try {
      const playerData = await this.fetchPlayerData(message.player_id);
      if (this.updateCallback) {
        this.updateCallback(playerData);
      }
    } catch (error) {
      console.error(`Failed to process achievement earned: ${error}`);
    }
  }

  // Data parsing helpers (convert from Cairo/Starknet format)

  private parsePlayerData(rawData: string[]): any {
    return {
      id: rawData[0],
      level: parseInt(rawData[1], 16),
      experience: parseInt(rawData[2], 16),
      stats: {
        playtime: parseInt(rawData[3], 16),
        score: parseInt(rawData[4], 16),
        custom_stats: rawData[5] ? JSON.parse(rawData[5]) : {}
      }
    };
  }

  private parseAssetArray(rawData: string[]): any[] {
    const assets = [];
    
    for (let i = 0; i < rawData.length; i += 7) {
      assets.push({
        id: rawData[i],
        token_id: rawData[i + 1],
        contract_address: rawData[i + 2],
        owner: rawData[i + 3],
        asset_type: parseInt(rawData[i + 4], 16),
        tradeable: rawData[i + 5] === '1',
        metadata: rawData[i + 6] ? JSON.parse(rawData[i + 6]) : {}
      });
    }
    
    return assets;
  }

  private parseAchievementArray(rawData: string[]): any[] {
    const achievements = [];
    
    for (let i = 0; i < rawData.length; i += 6) {
      achievements.push({
        id: rawData[i],
        achievement_type: rawData[i + 1],
        title: rawData[i + 2],
        description: rawData[i + 3],
        rarity: parseInt(rawData[i + 4], 16),
        earned_at: parseInt(rawData[i + 5], 16)
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