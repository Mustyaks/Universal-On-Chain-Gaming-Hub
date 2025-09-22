/**
 * Data validation and integrity checking service
 * Ensures data consistency and validates game data against on-chain sources
 */

import { GameAdapter } from './GameAdapter';
import { AdapterRegistry } from './AdapterRegistry';
import { ErrorHandler } from './ErrorHandler';
import {
  StandardizedGameData,
  PlayerGameData,
  GameAsset,
  Achievement,
  GameStatistics,
  GameHubError
} from '../../types/core';

export interface ValidationRule {
  name: string;
  description: string;
  validate: (data: any) => Promise<ValidationResult>;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationConfig {
  enableOnChainValidation: boolean;
  enableCrossGameValidation: boolean;
  enableTimestampValidation: boolean;
  enableAssetValidation: boolean;
  enableAchievementValidation: boolean;
  maxTimestampDriftMs: number;
  cacheValidationResults: boolean;
  validationCacheTtlMs: number;
}

export class DataValidator {
  private adapterRegistry: AdapterRegistry;
  private config: ValidationConfig;
  private validationRules: ValidationRule[] = [];
  private validationCache = new Map<string, { result: ValidationResult; timestamp: number }>();

  constructor(adapterRegistry: AdapterRegistry, config: ValidationConfig) {
    this.adapterRegistry = adapterRegistry;
    this.config = config;
    this.initializeValidationRules();
  }

  /**
   * Validate complete player game data
   */
  async validatePlayerData(data: PlayerGameData): Promise<ValidationResult> {
    const cacheKey = `${data.gameId}:${data.playerId}:${data.syncedAt}`;
    
    // Check cache first
    if (this.config.cacheValidationResults) {
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Run all validation rules
      for (const rule of this.validationRules) {
        const ruleResult = await rule.validate(data);
        
        result.errors.push(...ruleResult.errors);
        result.warnings.push(...ruleResult.warnings);
        
        if (!ruleResult.isValid && rule.severity === 'ERROR') {
          result.isValid = false;
        }
      }

      // Cache result if enabled
      if (this.config.cacheValidationResults) {
        this.cacheResult(cacheKey, result);
      }

      return result;
    } catch (error) {
      const gameError = ErrorHandler.classifyError(error);
      
      result.isValid = false;
      result.errors.push({
        field: 'validation',
        message: `Validation failed: ${gameError.message}`,
        code: 'VALIDATION_ERROR',
        value: error
      });

      return result;
    }
  }

  /**
   * Validate standardized game data
   */
  async validateStandardizedData(data: StandardizedGameData): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Basic structure validation
    const structureResult = await this.validateDataStructure(data);
    result.errors.push(...structureResult.errors);
    result.warnings.push(...structureResult.warnings);

    if (!structureResult.isValid) {
      result.isValid = false;
    }

    // Asset validation
    if (this.config.enableAssetValidation && data.assets) {
      const assetResult = await this.validateAssets(data.gameId, data.assets);
      result.errors.push(...assetResult.errors);
      result.warnings.push(...assetResult.warnings);

      if (!assetResult.isValid) {
        result.isValid = false;
      }
    }

    // Achievement validation
    if (this.config.enableAchievementValidation && data.achievements) {
      const achievementResult = await this.validateAchievements(data.gameId, data.achievements);
      result.errors.push(...achievementResult.errors);
      result.warnings.push(...achievementResult.warnings);

      if (!achievementResult.isValid) {
        result.isValid = false;
      }
    }

    // Timestamp validation
    if (this.config.enableTimestampValidation) {
      const timestampResult = this.validateTimestamp(data.lastUpdated);
      result.errors.push(...timestampResult.errors);
      result.warnings.push(...timestampResult.warnings);

      if (!timestampResult.isValid) {
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * Validate individual game asset
   */
  async validateAsset(gameId: string, asset: GameAsset): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Basic asset structure validation
    if (!asset.id) {
      result.errors.push({
        field: 'id',
        message: 'Asset ID is required',
        code: 'MISSING_ASSET_ID'
      });
      result.isValid = false;
    }

    if (!asset.tokenId) {
      result.errors.push({
        field: 'tokenId',
        message: 'Token ID is required',
        code: 'MISSING_TOKEN_ID'
      });
      result.isValid = false;
    }

    if (!asset.contractAddress) {
      result.errors.push({
        field: 'contractAddress',
        message: 'Contract address is required',
        code: 'MISSING_CONTRACT_ADDRESS'
      });
      result.isValid = false;
    }

    if (!asset.owner) {
      result.errors.push({
        field: 'owner',
        message: 'Asset owner is required',
        code: 'MISSING_OWNER'
      });
      result.isValid = false;
    }

    // On-chain validation
    if (this.config.enableOnChainValidation && result.isValid) {
      const adapter = this.adapterRegistry.getAdapter(gameId);
      
      if (adapter) {
        try {
          const isValidOnChain = await adapter.validateAsset(asset);
          
          if (!isValidOnChain) {
            result.errors.push({
              field: 'onChainValidation',
              message: 'Asset validation failed on-chain',
              code: 'ON_CHAIN_VALIDATION_FAILED',
              value: asset
            });
            result.isValid = false;
          }
        } catch (error) {
          result.warnings.push({
            field: 'onChainValidation',
            message: `On-chain validation error: ${error.message}`,
            code: 'ON_CHAIN_VALIDATION_ERROR',
            value: error
          });
        }
      }
    }

    // Metadata validation
    if (asset.metadata) {
      const metadataResult = this.validateAssetMetadata(asset.metadata);
      result.errors.push(...metadataResult.errors);
      result.warnings.push(...metadataResult.warnings);

      if (!metadataResult.isValid) {
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * Add custom validation rule
   */
  addValidationRule(rule: ValidationRule): void {
    this.validationRules.push(rule);
  }

  /**
   * Remove validation rule by name
   */
  removeValidationRule(name: string): void {
    this.validationRules = this.validationRules.filter(rule => rule.name !== name);
  }

  /**
   * Get all validation rules
   */
  getValidationRules(): ValidationRule[] {
    return [...this.validationRules];
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear();
  }

  // Private methods

  private initializeValidationRules(): void {
    // Basic data structure validation
    this.validationRules.push({
      name: 'basic_structure',
      description: 'Validates basic data structure requirements',
      severity: 'ERROR',
      validate: async (data: PlayerGameData) => {
        const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

        if (!data.playerId) {
          result.errors.push({
            field: 'playerId',
            message: 'Player ID is required',
            code: 'MISSING_PLAYER_ID'
          });
          result.isValid = false;
        }

        if (!data.gameId) {
          result.errors.push({
            field: 'gameId',
            message: 'Game ID is required',
            code: 'MISSING_GAME_ID'
          });
          result.isValid = false;
        }

        if (!data.normalizedData) {
          result.errors.push({
            field: 'normalizedData',
            message: 'Normalized data is required',
            code: 'MISSING_NORMALIZED_DATA'
          });
          result.isValid = false;
        }

        return result;
      }
    });

    // Cross-game consistency validation
    if (this.config.enableCrossGameValidation) {
      this.validationRules.push({
        name: 'cross_game_consistency',
        description: 'Validates data consistency across games',
        severity: 'WARNING',
        validate: async (data: PlayerGameData) => {
          const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

          // Check for duplicate assets across games
          const allAdapters = this.adapterRegistry.getAllAdapters();
          
          for (const adapter of allAdapters) {
            if (adapter.gameId === data.gameId) continue;

            try {
              const otherGameData = await adapter.fetchPlayerData(data.playerId);
              
              // Check for asset conflicts
              const conflicts = this.findAssetConflicts(
                data.normalizedData.assets,
                otherGameData.normalizedData.assets
              );

              for (const conflict of conflicts) {
                result.warnings.push({
                  field: 'assets',
                  message: `Asset conflict detected with game ${adapter.gameId}`,
                  code: 'CROSS_GAME_ASSET_CONFLICT',
                  value: conflict
                });
              }
            } catch (error) {
              // Ignore errors from other games for cross-validation
            }
          }

          return result;
        }
      });
    }
  }

  private async validateDataStructure(data: StandardizedGameData): Promise<ValidationResult> {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!data.playerId) {
      result.errors.push({
        field: 'playerId',
        message: 'Player ID is required',
        code: 'MISSING_PLAYER_ID'
      });
      result.isValid = false;
    }

    if (!data.gameId) {
      result.errors.push({
        field: 'gameId',
        message: 'Game ID is required',
        code: 'MISSING_GAME_ID'
      });
      result.isValid = false;
    }

    if (!Array.isArray(data.assets)) {
      result.errors.push({
        field: 'assets',
        message: 'Assets must be an array',
        code: 'INVALID_ASSETS_TYPE'
      });
      result.isValid = false;
    }

    if (!Array.isArray(data.achievements)) {
      result.errors.push({
        field: 'achievements',
        message: 'Achievements must be an array',
        code: 'INVALID_ACHIEVEMENTS_TYPE'
      });
      result.isValid = false;
    }

    return result;
  }

  private async validateAssets(gameId: string, assets: GameAsset[]): Promise<ValidationResult> {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const assetResult = await this.validateAsset(gameId, asset);
      
      // Prefix field names with array index
      assetResult.errors.forEach(error => {
        error.field = `assets[${i}].${error.field}`;
      });
      
      assetResult.warnings.forEach(warning => {
        warning.field = `assets[${i}].${warning.field}`;
      });

      result.errors.push(...assetResult.errors);
      result.warnings.push(...assetResult.warnings);

      if (!assetResult.isValid) {
        result.isValid = false;
      }
    }

    return result;
  }

  private async validateAchievements(gameId: string, achievements: Achievement[]): Promise<ValidationResult> {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    for (let i = 0; i < achievements.length; i++) {
      const achievement = achievements[i];
      
      if (!achievement.id) {
        result.errors.push({
          field: `achievements[${i}].id`,
          message: 'Achievement ID is required',
          code: 'MISSING_ACHIEVEMENT_ID'
        });
        result.isValid = false;
      }

      if (!achievement.title) {
        result.errors.push({
          field: `achievements[${i}].title`,
          message: 'Achievement title is required',
          code: 'MISSING_ACHIEVEMENT_TITLE'
        });
        result.isValid = false;
      }

      if (!achievement.earnedAt || achievement.earnedAt <= 0) {
        result.errors.push({
          field: `achievements[${i}].earnedAt`,
          message: 'Valid earned timestamp is required',
          code: 'INVALID_EARNED_TIMESTAMP'
        });
        result.isValid = false;
      }
    }

    return result;
  }

  private validateTimestamp(timestamp: number): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
    const now = Date.now();
    const drift = Math.abs(now - timestamp);

    if (drift > this.config.maxTimestampDriftMs) {
      if (timestamp > now) {
        result.errors.push({
          field: 'lastUpdated',
          message: 'Timestamp is in the future',
          code: 'FUTURE_TIMESTAMP',
          value: timestamp
        });
        result.isValid = false;
      } else {
        result.warnings.push({
          field: 'lastUpdated',
          message: 'Timestamp is significantly old',
          code: 'OLD_TIMESTAMP',
          value: timestamp
        });
      }
    }

    return result;
  }

  private validateAssetMetadata(metadata: any): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!metadata.name) {
      result.warnings.push({
        field: 'metadata.name',
        message: 'Asset name is recommended',
        code: 'MISSING_ASSET_NAME'
      });
    }

    if (!metadata.description) {
      result.warnings.push({
        field: 'metadata.description',
        message: 'Asset description is recommended',
        code: 'MISSING_ASSET_DESCRIPTION'
      });
    }

    if (metadata.attributes && !Array.isArray(metadata.attributes)) {
      result.errors.push({
        field: 'metadata.attributes',
        message: 'Attributes must be an array',
        code: 'INVALID_ATTRIBUTES_TYPE'
      });
      result.isValid = false;
    }

    return result;
  }

  private findAssetConflicts(assets1: GameAsset[], assets2: GameAsset[]): any[] {
    const conflicts = [];
    
    for (const asset1 of assets1) {
      for (const asset2 of assets2) {
        if (asset1.tokenId === asset2.tokenId && 
            asset1.contractAddress === asset2.contractAddress &&
            asset1.owner !== asset2.owner) {
          conflicts.push({
            asset1: asset1.id,
            asset2: asset2.id,
            tokenId: asset1.tokenId,
            contractAddress: asset1.contractAddress
          });
        }
      }
    }
    
    return conflicts;
  }

  private getCachedResult(key: string): ValidationResult | null {
    const cached = this.validationCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.config.validationCacheTtlMs) {
      return cached.result;
    }
    
    return null;
  }

  private cacheResult(key: string, result: ValidationResult): void {
    this.validationCache.set(key, {
      result,
      timestamp: Date.now()
    });
  }
}