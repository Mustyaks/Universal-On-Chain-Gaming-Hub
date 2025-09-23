/**
 * Main SDK class for Dojo game integration with Universal Gaming Hub
 * Provides easy-to-use interface for game developers
 */

import { EventEmitter } from 'events';
import {
  SDKConfig,
  PluginAdapter,
  IntegrationStatus,
  SDKEventEmitter,
  SDKEvent,
  DiagnosticInfo,
  WebhookConfig,
  ValidationResult
} from './types';
import { StandardizedGameData, PlayerGameData, GameAsset } from '../types/core';
import { DataValidator, HealthMonitor, WebhookManager } from './utils';

export class DojoGameSDK extends EventEmitter implements SDKEventEmitter {
  public config: SDKConfig;
  private adapter: PluginAdapter | null = null;
  public validator: DataValidator;
  private healthMonitor: HealthMonitor;
  private webhookManager: WebhookManager;
  public initialized: boolean = false;
  private startTime: number;

  constructor(config: SDKConfig) {
    super();
    this.config = config;
    this.startTime = Date.now();

    this.validator = new DataValidator();
    this.healthMonitor = new HealthMonitor(this);
    this.webhookManager = new WebhookManager(this);
  }

  /**
   * Initialize the SDK with a plugin adapter
   */
  async initialize(adapter?: PluginAdapter): Promise<void> {
    if (!adapter) {
      throw new Error('Adapter is required for SDK initialization');
    }

    try {
      // Use provided adapter
      this.adapter = adapter;

      await this.adapter.initialize(this.config);

      // Set up event forwarding
      this.setupEventForwarding();

      // Start health monitoring
      await this.healthMonitor.start();

      this.initialized = true;
      this.emit('connected');

      console.log(`DojoGameSDK initialized for game: ${this.config.gameName}`);
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to initialize SDK: ${error}`);
    }
  }

  /**
   * Shutdown the SDK and cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      if (this.adapter) {
        await this.adapter.shutdown();
      }

      await this.healthMonitor.stop();
      await this.webhookManager.shutdown();

      this.initialized = false;
      this.emit('disconnected');

      console.log(`DojoGameSDK shutdown for game: ${this.config.gameName}`);
    } catch (error) {
      console.error('Error during SDK shutdown:', error);
      throw error;
    }
  }

  /**
   * Sync player data to the Universal Gaming Hub
   */
  async syncPlayerData(playerId: string): Promise<StandardizedGameData> {
    this.ensureInitialized();

    try {
      const playerData = await this.adapter!.fetchPlayerData(playerId);

      // Validate data before sending
      const validationResult = await this.validatePlayerData(playerData.normalizedData);
      if (!validationResult.valid) {
        throw new Error(`Data validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
      }

      // Send to hub (simulated - would make actual API call)
      await this.sendToHub('player-data', playerData.normalizedData);

      this.emit('dataSync', playerData.normalizedData);

      return playerData.normalizedData;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time player updates
   */
  async subscribeToPlayerUpdates(playerId: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.adapter!.subscribeToUpdates((data: PlayerGameData) => {
        if (data.playerId === playerId) {
          this.emit('playerUpdate', data);
        }
      });

      console.log(`Subscribed to updates for player: ${playerId}`);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Validate game asset data
   */
  async validateAsset(asset: GameAsset): Promise<boolean> {
    this.ensureInitialized();

    try {
      return await this.adapter!.validateAsset(asset);
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Get integration status and metrics
   */
  getIntegrationStatus(): IntegrationStatus {
    if (!this.adapter) {
      return {
        connected: false,
        lastSync: 0,
        errors: [],
        metrics: {
          totalSyncs: 0,
          successfulSyncs: 0,
          failedSyncs: 0,
          averageResponseTime: 0,
          lastSyncDuration: 0
        }
      };
    }

    return this.adapter.getIntegrationStatus();
  }

  /**
   * Get comprehensive diagnostic information
   */
  async getDiagnosticInfo(): Promise<DiagnosticInfo> {
    const healthChecks = await this.healthMonitor.runAllChecks();

    return {
      sdkVersion: '1.0.0',
      gameId: this.config.gameId,
      environment: this.config.environment,
      uptime: Date.now() - this.startTime,
      healthChecks,
      integrationStatus: this.getIntegrationStatus()
    };
  }

  /**
   * Configure webhooks for event notifications
   */
  async configureWebhook(config: WebhookConfig): Promise<void> {
    await this.webhookManager.configure(config);
  }

  /**
   * Test the integration with sample data
   */
  async testIntegration(): Promise<ValidationResult> {
    this.ensureInitialized();

    try {
      // Create sample data for testing
      const sampleData: StandardizedGameData = {
        playerId: 'test-player-123',
        gameId: this.config.gameId,
        assets: [
          {
            id: 'test-asset-1',
            gameId: this.config.gameId,
            tokenId: '1',
            contractAddress: '0x123...',
            assetType: 'NFT',
            metadata: {
              name: 'Test Sword',
              description: 'A test weapon',
              image: 'https://example.com/sword.png',
              attributes: [
                { trait_type: 'Damage', value: 100 },
                { trait_type: 'Rarity', value: 'Epic' }
              ],
              rarity: 'EPIC'
            },
            owner: '0xtest...',
            tradeable: true
          }
        ],
        achievements: [
          {
            id: 'test-achievement-1',
            gameId: this.config.gameId,
            playerId: 'test-player-123',
            achievementType: 'first_kill',
            title: 'First Blood',
            description: 'Defeat your first enemy',
            rarity: 'COMMON',
            earnedAt: Date.now()
          }
        ],
        statistics: {
          gameId: this.config.gameId,
          playerId: 'test-player-123',
          playtime: 3600,
          level: 5,
          score: 1500,
          customStats: {
            kills: 10,
            deaths: 2,
            items_collected: 25
          }
        },
        lastUpdated: Date.now()
      };

      // Validate the sample data
      const validationResult = await this.validatePlayerData(sampleData);

      if (validationResult.valid) {
        console.log('Integration test passed successfully');
      } else {
        console.warn('Integration test found validation issues:', validationResult.errors);
      }

      return validationResult;
    } catch (error) {
      this.emit('error', error);
      return {
        valid: false,
        errors: [{ field: 'integration', message: `Test failed: ${error}`, code: 'TEST_FAILED' }],
        warnings: []
      };
    }
  }

  /**
   * Batch sync multiple players
   */
  async batchSyncPlayers(playerIds: string[], batchSize: number = 10): Promise<{
    successful: StandardizedGameData[];
    failed: Array<{ playerId: string; error: Error }>;
  }> {
    this.ensureInitialized();

    const successful: StandardizedGameData[] = [];
    const failed: Array<{ playerId: string; error: Error }> = [];

    // Process in batches
    for (let i = 0; i < playerIds.length; i += batchSize) {
      const batch = playerIds.slice(i, i + batchSize);

      const batchPromises = batch.map(async (playerId) => {
        try {
          const data = await this.syncPlayerData(playerId);
          successful.push(data);
        } catch (error) {
          failed.push({ playerId, error: error as Error });
        }
      });

      await Promise.all(batchPromises);
    }

    return { successful, failed };
  }

  // Private helper methods

  private ensureInitialized(): void {
    if (!this.initialized || !this.adapter) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
  }

  private setupEventForwarding(): void {
    if (!this.adapter) return;

    // Forward adapter events to SDK events
    // Note: In a real implementation, adapters would extend EventEmitter
    // For now, we'll skip event forwarding in the mock implementation
  }

  private async validatePlayerData(data: StandardizedGameData): Promise<ValidationResult> {
    return this.validator.validateStandardizedData(data);
  }

  private async sendToHub(endpoint: string, data: any): Promise<void> {
    // Simulate API call to Universal Gaming Hub
    // In real implementation, this would make HTTP request to hub
    const response = await fetch(`${this.config.hubEndpoint}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.config.apiKey ? `Bearer ${this.config.apiKey}` : '',
        'X-Game-ID': this.config.gameId
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Hub API error: ${response.status} ${response.statusText}`);
    }
  }

  // Event emitter methods with proper typing
  override on(event: SDKEvent, handler: (...args: any[]) => void): this {
    super.on(event, handler);
    return this;
  }

  override off(event: SDKEvent, handler: (...args: any[]) => void): this {
    super.off(event, handler);
    return this;
  }

  override emit(event: SDKEvent, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}