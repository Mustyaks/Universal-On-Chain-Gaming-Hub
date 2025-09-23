/**
 * Base plugin adapter that implements the PluginAdapter interface
 * Provides common functionality for all Dojo game integrations
 */

import { BaseGameAdapter, GameAdapterConfig } from '../../services/aggregation/GameAdapter';
import { PluginAdapter, SDKConfig, IntegrationStatus, IntegrationError, IntegrationMetrics } from '../types';
import { StandardizedGameData, PlayerGameData, GameAsset } from '../../types/core';

export class BasePluginAdapter extends BaseGameAdapter implements PluginAdapter {
  protected sdkConfig: SDKConfig | null = null;
  private integrationErrors: IntegrationError[] = [];
  private metrics: IntegrationMetrics = {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    averageResponseTime: 0,
    lastSyncDuration: 0
  };
  private responseTimes: number[] = [];

  constructor(config: GameAdapterConfig) {
    super(config);
  }

  /**
   * Initialize the plugin adapter with SDK configuration
   */
  async initialize(config: SDKConfig): Promise<void> {
    this.sdkConfig = config;
    
    try {
      // Perform any game-specific initialization
      await this.initializeGameConnection();
      
      console.log(`BasePluginAdapter initialized for ${this.gameName}`);
    } catch (error) {
      this.addIntegrationError('INIT_FAILED', `Initialization failed: ${error}`, false);
      throw error;
    }
  }

  /**
   * Shutdown the plugin adapter
   */
  async shutdown(): Promise<void> {
    try {
      await this.disconnectFromGameNetwork();
      this.sdkConfig = null;
      
      console.log(`BasePluginAdapter shutdown for ${this.gameName}`);
    } catch (error) {
      console.error('Error during adapter shutdown:', error);
      throw error;
    }
  }

  /**
   * Get current integration status
   */
  getIntegrationStatus(): IntegrationStatus {
    return {
      connected: this.isConnected,
      lastSync: this.lastSyncTime,
      errors: this.integrationErrors.filter(e => !e.resolved),
      metrics: this.metrics
    };
  }

  /**
   * Enhanced fetchPlayerData with metrics tracking
   */
  override async fetchPlayerData(playerId: string): Promise<PlayerGameData> {
    const startTime = Date.now();
    this.metrics.totalSyncs++;
    
    try {
      const result = await super.fetchPlayerData(playerId);
      
      // Track successful sync
      this.metrics.successfulSyncs++;
      this.trackResponseTime(Date.now() - startTime);
      
      return result;
    } catch (error) {
      this.metrics.failedSyncs++;
      this.addIntegrationError('SYNC_FAILED', `Failed to sync player ${playerId}: ${error}`, false);
      throw error;
    }
  }

  /**
   * Enhanced normalize method with validation
   */
  async normalize(rawData: any): Promise<StandardizedGameData> {
    try {
      // Validate raw data structure
      this.validateRawData(rawData);
      
      // Perform normalization
      const normalized = await this.performNormalization(rawData);
      
      // Validate normalized data
      this.validateNormalizedData(normalized);
      
      return normalized;
    } catch (error) {
      this.addIntegrationError('NORMALIZATION_FAILED', `Data normalization failed: ${error}`, false);
      throw error;
    }
  }

  /**
   * Enhanced asset validation with detailed checks
   */
  async validateAsset(asset: GameAsset): Promise<boolean> {
    try {
      // Basic structure validation
      if (!asset.id || !asset.gameId || !asset.tokenId) {
        return false;
      }
      
      // Game-specific validation
      const isValid = await this.performAssetValidation(asset);
      
      if (!isValid) {
        this.addIntegrationError('ASSET_VALIDATION_FAILED', `Asset validation failed for ${asset.id}`, false);
      }
      
      return isValid;
    } catch (error) {
      this.addIntegrationError('ASSET_VALIDATION_ERROR', `Asset validation error: ${error}`, false);
      return false;
    }
  }

  // Protected methods for subclasses to override

  protected async initializeGameConnection(): Promise<void> {
    // Default implementation - override in subclasses
    console.log(`Initializing connection for ${this.gameName}`);
  }

  protected async performNormalization(rawData: any): Promise<StandardizedGameData> {
    // Default normalization logic
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

  protected async performAssetValidation(_asset: GameAsset): Promise<boolean> {
    // Default validation - override in subclasses for game-specific logic
    return true;
  }

  protected validateRawData(rawData: any): void {
    if (!rawData) {
      throw new Error('Raw data is null or undefined');
    }
    
    if (typeof rawData !== 'object') {
      throw new Error('Raw data must be an object');
    }
    
    if (!rawData.player_id) {
      throw new Error('Raw data missing required field: player_id');
    }
  }

  protected validateNormalizedData(data: StandardizedGameData): void {
    if (!data.playerId) {
      throw new Error('Normalized data missing playerId');
    }
    
    if (!data.gameId) {
      throw new Error('Normalized data missing gameId');
    }
    
    if (!Array.isArray(data.assets)) {
      throw new Error('Normalized data assets must be an array');
    }
    
    if (!Array.isArray(data.achievements)) {
      throw new Error('Normalized data achievements must be an array');
    }
    
    if (!data.statistics) {
      throw new Error('Normalized data missing statistics');
    }
  }

  // Abstract methods that must be implemented by concrete adapters
  async fetchRawPlayerData(_playerId: string): Promise<any> {
    throw new Error('fetchRawPlayerData must be implemented by concrete adapter');
  }

  async connectToGameNetwork(): Promise<void> {
    throw new Error('connectToGameNetwork must be implemented by concrete adapter');
  }

  async disconnectFromGameNetwork(): Promise<void> {
    throw new Error('disconnectFromGameNetwork must be implemented by concrete adapter');
  }

  // Private helper methods

  private addIntegrationError(code: string, message: string, resolved: boolean): void {
    this.integrationErrors.push({
      code,
      message,
      timestamp: Date.now(),
      resolved
    });
    
    // Keep only last 100 errors
    if (this.integrationErrors.length > 100) {
      this.integrationErrors = this.integrationErrors.slice(-100);
    }
  }

  private trackResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);
    this.metrics.lastSyncDuration = responseTime;
    
    // Keep only last 100 response times for average calculation
    if (this.responseTimes.length > 100) {
      this.responseTimes = this.responseTimes.slice(-100);
    }
    
    // Calculate average response time
    this.metrics.averageResponseTime = 
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Mark integration errors as resolved
   */
  resolveIntegrationErrors(codes: string[]): void {
    this.integrationErrors.forEach(error => {
      if (codes.includes(error.code)) {
        error.resolved = true;
      }
    });
  }

  /**
   * Get detailed metrics for monitoring
   */
  getDetailedMetrics(): IntegrationMetrics & {
    errorRate: number;
    recentResponseTimes: number[];
    uptimePercentage: number;
  } {
    const errorRate = this.metrics.totalSyncs > 0 
      ? (this.metrics.failedSyncs / this.metrics.totalSyncs) * 100 
      : 0;
    
    const uptimePercentage = this.metrics.totalSyncs > 0
      ? (this.metrics.successfulSyncs / this.metrics.totalSyncs) * 100
      : 100;
    
    return {
      ...this.metrics,
      errorRate,
      recentResponseTimes: this.responseTimes.slice(-10),
      uptimePercentage
    };
  }
}