/**
 * Factory for creating appropriate adapters based on game configuration
 * Simplifies adapter selection and configuration for developers
 */

import { PluginAdapter } from '../types';
import { BasePluginAdapter } from './BasePluginAdapter';
import { StandardDojoAdapter, StandardDojoConfig } from './StandardDojoAdapter';
import { GameAdapterConfig } from '../../services/aggregation/GameAdapter';

export type AdapterType = 'standard' | 'custom' | 'auto';

export interface AdapterFactoryConfig {
  type: AdapterType;
  gameId: string;
  gameName: string;
  contractAddress: string;
  rpcEndpoint: string;
  wsEndpoint?: string;
  
  // Standard Dojo specific
  worldAddress?: string;
  systemAddresses?: {
    player: string;
    assets: string;
    achievements: string;
  };
  eventTopics?: {
    playerUpdate: string;
    assetTransfer: string;
    achievementEarned: string;
  };
  
  // Custom adapter specific
  customConfig?: Record<string, any>;
  
  // Common configuration
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
  cacheConfig?: {
    ttlSeconds: number;
    maxEntries: number;
    enableCache: boolean;
  };
}

export class AdapterFactory {
  /**
   * Create an adapter based on configuration
   */
  static createAdapter(config: AdapterFactoryConfig): PluginAdapter {
    const adapterType = config.type === 'auto' ? this.detectAdapterType(config) : config.type;
    
    switch (adapterType) {
      case 'standard':
        return this.createStandardAdapter(config);
      
      case 'custom':
        return this.createCustomAdapter(config);
      
      default:
        throw new Error(`Unsupported adapter type: ${adapterType}`);
    }
  }

  /**
   * Create a standard Dojo adapter
   */
  static createStandardAdapter(config: AdapterFactoryConfig): StandardDojoAdapter {
    if (!config.worldAddress || !config.systemAddresses) {
      throw new Error('Standard Dojo adapter requires worldAddress and systemAddresses');
    }

    const standardConfig: StandardDojoConfig = {
      gameId: config.gameId,
      gameName: config.gameName,
      contractAddress: config.contractAddress,
      rpcEndpoint: config.rpcEndpoint,
      wsEndpoint: config.wsEndpoint,
      worldAddress: config.worldAddress,
      systemAddresses: config.systemAddresses,
      eventTopics: config.eventTopics || {
        playerUpdate: 'PlayerUpdated',
        assetTransfer: 'AssetTransferred',
        achievementEarned: 'AchievementEarned'
      },
      retryConfig: config.retryConfig || {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2
      },
      cacheConfig: config.cacheConfig || {
        ttlSeconds: 300,
        maxEntries: 1000,
        enableCache: true
      }
    };

    return new StandardDojoAdapter(standardConfig);
  }

  /**
   * Create a custom adapter (base implementation)
   */
  static createCustomAdapter(config: AdapterFactoryConfig): BasePluginAdapter {
    const baseConfig: GameAdapterConfig = {
      gameId: config.gameId,
      gameName: config.gameName,
      contractAddress: config.contractAddress,
      rpcEndpoint: config.rpcEndpoint,
      wsEndpoint: config.wsEndpoint,
      retryConfig: config.retryConfig || {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2
      },
      cacheConfig: config.cacheConfig || {
        ttlSeconds: 300,
        maxEntries: 1000,
        enableCache: true
      }
    };

    return new BasePluginAdapter(baseConfig);
  }

  /**
   * Auto-detect the appropriate adapter type based on configuration
   */
  static detectAdapterType(config: AdapterFactoryConfig): 'standard' | 'custom' {
    // If standard Dojo configuration is provided, use standard adapter
    if (config.worldAddress && config.systemAddresses) {
      return 'standard';
    }
    
    // If custom configuration is provided, use custom adapter
    if (config.customConfig) {
      return 'custom';
    }
    
    // Default to standard if we have basic Dojo info
    if (config.contractAddress && config.rpcEndpoint) {
      return 'standard';
    }
    
    // Fallback to custom
    return 'custom';
  }

  /**
   * Validate adapter configuration
   */
  static validateConfig(config: AdapterFactoryConfig): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!config.gameId) {
      errors.push('gameId is required');
    }

    if (!config.gameName) {
      errors.push('gameName is required');
    }

    if (!config.contractAddress) {
      errors.push('contractAddress is required');
    }

    if (!config.rpcEndpoint) {
      errors.push('rpcEndpoint is required');
    }

    // Validate RPC endpoint format
    if (config.rpcEndpoint && !this.isValidUrl(config.rpcEndpoint)) {
      errors.push('rpcEndpoint must be a valid URL');
    }

    // Validate WebSocket endpoint format
    if (config.wsEndpoint && !this.isValidWebSocketUrl(config.wsEndpoint)) {
      errors.push('wsEndpoint must be a valid WebSocket URL');
    }

    // Type-specific validation
    if (config.type === 'standard') {
      if (!config.worldAddress) {
        errors.push('worldAddress is required for standard adapter');
      }

      if (!config.systemAddresses) {
        errors.push('systemAddresses is required for standard adapter');
      } else {
        if (!config.systemAddresses.player) {
          errors.push('systemAddresses.player is required');
        }
        if (!config.systemAddresses.assets) {
          errors.push('systemAddresses.assets is required');
        }
        if (!config.systemAddresses.achievements) {
          errors.push('systemAddresses.achievements is required');
        }
      }
    }

    // Warnings
    if (!config.wsEndpoint) {
      warnings.push('wsEndpoint not provided - real-time updates will be disabled');
    }

    if (config.retryConfig && config.retryConfig.maxRetries > 10) {
      warnings.push('High retry count may cause performance issues');
    }

    if (config.cacheConfig && config.cacheConfig.ttlSeconds < 60) {
      warnings.push('Low cache TTL may cause excessive API calls');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get recommended configuration for common game types
   */
  static getRecommendedConfig(gameType: 'rpg' | 'strategy' | 'racing' | 'puzzle' | 'generic'): Partial<AdapterFactoryConfig> {
    const baseConfig = {
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
    };

    switch (gameType) {
      case 'rpg':
        return {
          ...baseConfig,
          type: 'standard' as AdapterType,
          eventTopics: {
            playerUpdate: 'PlayerLevelUp',
            assetTransfer: 'ItemTransferred',
            achievementEarned: 'QuestCompleted'
          },
          cacheConfig: {
            ...baseConfig.cacheConfig,
            ttlSeconds: 600, // Longer cache for RPG data
            maxEntries: 2000
          }
        };

      case 'strategy':
        return {
          ...baseConfig,
          type: 'standard' as AdapterType,
          eventTopics: {
            playerUpdate: 'GameStateChanged',
            assetTransfer: 'ResourceTransferred',
            achievementEarned: 'VictoryAchieved'
          },
          retryConfig: {
            ...baseConfig.retryConfig,
            maxRetries: 5 // Higher retries for strategy games
          }
        };

      case 'racing':
        return {
          ...baseConfig,
          type: 'standard' as AdapterType,
          eventTopics: {
            playerUpdate: 'RaceCompleted',
            assetTransfer: 'CarTransferred',
            achievementEarned: 'RecordBroken'
          },
          cacheConfig: {
            ...baseConfig.cacheConfig,
            ttlSeconds: 120 // Shorter cache for racing data
          }
        };

      case 'puzzle':
        return {
          ...baseConfig,
          type: 'standard' as AdapterType,
          eventTopics: {
            playerUpdate: 'PuzzleSolved',
            assetTransfer: 'HintUsed',
            achievementEarned: 'LevelCompleted'
          }
        };

      default:
        return {
          ...baseConfig,
          type: 'auto' as AdapterType
        };
    }
  }

  /**
   * Create adapter with recommended settings for game type
   */
  static createRecommendedAdapter(
    gameType: 'rpg' | 'strategy' | 'racing' | 'puzzle' | 'generic',
    baseConfig: Pick<AdapterFactoryConfig, 'gameId' | 'gameName' | 'contractAddress' | 'rpcEndpoint' | 'worldAddress' | 'systemAddresses'>
  ): PluginAdapter {
    const recommendedConfig = this.getRecommendedConfig(gameType);
    const fullConfig: AdapterFactoryConfig = {
      ...recommendedConfig,
      ...baseConfig
    } as AdapterFactoryConfig;

    return this.createAdapter(fullConfig);
  }

  // Private helper methods

  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private static isValidWebSocketUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:';
    } catch {
      return false;
    }
  }
}