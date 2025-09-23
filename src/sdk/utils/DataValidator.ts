/**
 * Data validation utilities for SDK
 * Validates game data structures and formats
 */

import { StandardizedGameData, GameAsset, Achievement, GameStatistics } from '../../types/core';
import { ValidationResult, ValidationError, ValidationWarning } from '../types';

export class DataValidator {
  /**
   * Validate standardized game data
   */
  async validateStandardizedData(data: StandardizedGameData): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate required fields
    if (!data.playerId) {
      errors.push({
        field: 'playerId',
        message: 'Player ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!data.gameId) {
      errors.push({
        field: 'gameId',
        message: 'Game ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!data.lastUpdated || data.lastUpdated <= 0) {
      errors.push({
        field: 'lastUpdated',
        message: 'Last updated timestamp is required and must be positive',
        code: 'INVALID_TIMESTAMP'
      });
    }

    // Validate arrays
    if (!Array.isArray(data.assets)) {
      errors.push({
        field: 'assets',
        message: 'Assets must be an array',
        code: 'INVALID_TYPE'
      });
    } else {
      // Validate each asset
      for (let i = 0; i < data.assets.length; i++) {
        const asset = data.assets[i];
        if (asset) {
          const assetErrors = await this.validateAsset(asset);
          errors.push(...assetErrors.map(error => ({
            ...error,
            field: `assets[${i}].${error.field}`
          })));
        }
      }
    }

    if (!Array.isArray(data.achievements)) {
      errors.push({
        field: 'achievements',
        message: 'Achievements must be an array',
        code: 'INVALID_TYPE'
      });
    } else {
      // Validate each achievement
      for (let i = 0; i < data.achievements.length; i++) {
        const achievement = data.achievements[i];
        if (achievement) {
          const achievementErrors = await this.validateAchievement(achievement);
          errors.push(...achievementErrors.map(error => ({
            ...error,
            field: `achievements[${i}].${error.field}`
          })));
        }
      }
    }

    // Validate statistics
    if (data.statistics) {
      const statsErrors = await this.validateStatistics(data.statistics);
      errors.push(...statsErrors.map(error => ({
        ...error,
        field: `statistics.${error.field}`
      })));
    }

    // Add warnings for best practices
    if (data.assets.length === 0 && data.achievements.length === 0) {
      warnings.push({
        field: 'data',
        message: 'Player has no assets or achievements',
        suggestion: 'Consider if this is expected for new players'
      });
    }

    if (data.lastUpdated < Date.now() - (24 * 60 * 60 * 1000)) {
      warnings.push({
        field: 'lastUpdated',
        message: 'Data is more than 24 hours old',
        suggestion: 'Consider refreshing player data'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate game asset structure
   */
  async validateAsset(asset: GameAsset): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    if (!asset.id) {
      errors.push({
        field: 'id',
        message: 'Asset ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!asset.gameId) {
      errors.push({
        field: 'gameId',
        message: 'Game ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!asset.tokenId) {
      errors.push({
        field: 'tokenId',
        message: 'Token ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!asset.contractAddress) {
      errors.push({
        field: 'contractAddress',
        message: 'Contract address is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    } else if (!this.isValidAddress(asset.contractAddress)) {
      errors.push({
        field: 'contractAddress',
        message: 'Invalid contract address format',
        code: 'INVALID_ADDRESS'
      });
    }

    if (!asset.assetType || !['NFT', 'CURRENCY', 'ITEM'].includes(asset.assetType)) {
      errors.push({
        field: 'assetType',
        message: 'Asset type must be NFT, CURRENCY, or ITEM',
        code: 'INVALID_ENUM_VALUE'
      });
    }

    if (!asset.owner) {
      errors.push({
        field: 'owner',
        message: 'Asset owner is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    } else if (!this.isValidAddress(asset.owner)) {
      errors.push({
        field: 'owner',
        message: 'Invalid owner address format',
        code: 'INVALID_ADDRESS'
      });
    }

    // Validate metadata
    if (asset.metadata) {
      const metadataErrors = this.validateAssetMetadata(asset.metadata);
      errors.push(...metadataErrors.map(error => ({
        ...error,
        field: `metadata.${error.field}`
      })));
    }

    return errors;
  }

  /**
   * Validate achievement structure
   */
  async validateAchievement(achievement: Achievement): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    if (!achievement.id) {
      errors.push({
        field: 'id',
        message: 'Achievement ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!achievement.gameId) {
      errors.push({
        field: 'gameId',
        message: 'Game ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!achievement.playerId) {
      errors.push({
        field: 'playerId',
        message: 'Player ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!achievement.achievementType) {
      errors.push({
        field: 'achievementType',
        message: 'Achievement type is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!achievement.title) {
      errors.push({
        field: 'title',
        message: 'Achievement title is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!achievement.rarity || !['COMMON', 'RARE', 'EPIC', 'LEGENDARY'].includes(achievement.rarity)) {
      errors.push({
        field: 'rarity',
        message: 'Rarity must be COMMON, RARE, EPIC, or LEGENDARY',
        code: 'INVALID_ENUM_VALUE'
      });
    }

    if (!achievement.earnedAt || achievement.earnedAt <= 0) {
      errors.push({
        field: 'earnedAt',
        message: 'Earned timestamp is required and must be positive',
        code: 'INVALID_TIMESTAMP'
      });
    } else if (achievement.earnedAt > Date.now()) {
      errors.push({
        field: 'earnedAt',
        message: 'Earned timestamp cannot be in the future',
        code: 'INVALID_TIMESTAMP'
      });
    }

    return errors;
  }

  /**
   * Validate game statistics structure
   */
  async validateStatistics(stats: GameStatistics): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    if (!stats.gameId) {
      errors.push({
        field: 'gameId',
        message: 'Game ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!stats.playerId) {
      errors.push({
        field: 'playerId',
        message: 'Player ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (typeof stats.playtime !== 'number' || stats.playtime < 0) {
      errors.push({
        field: 'playtime',
        message: 'Playtime must be a non-negative number',
        code: 'INVALID_NUMBER'
      });
    }

    if (typeof stats.level !== 'number' || stats.level < 1) {
      errors.push({
        field: 'level',
        message: 'Level must be a positive number',
        code: 'INVALID_NUMBER'
      });
    }

    if (typeof stats.score !== 'number' || stats.score < 0) {
      errors.push({
        field: 'score',
        message: 'Score must be a non-negative number',
        code: 'INVALID_NUMBER'
      });
    }

    if (stats.customStats && typeof stats.customStats !== 'object') {
      errors.push({
        field: 'customStats',
        message: 'Custom stats must be an object',
        code: 'INVALID_TYPE'
      });
    }

    return errors;
  }

  /**
   * Validate asset metadata structure
   */
  private validateAssetMetadata(metadata: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!metadata.name) {
      errors.push({
        field: 'name',
        message: 'Asset name is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (metadata.image && !this.isValidUrl(metadata.image)) {
      errors.push({
        field: 'image',
        message: 'Asset image must be a valid URL',
        code: 'INVALID_URL'
      });
    }

    if (metadata.attributes && !Array.isArray(metadata.attributes)) {
      errors.push({
        field: 'attributes',
        message: 'Asset attributes must be an array',
        code: 'INVALID_TYPE'
      });
    } else if (metadata.attributes) {
      // Validate each attribute
      for (let i = 0; i < metadata.attributes.length; i++) {
        const attr = metadata.attributes[i];
        if (!attr.trait_type) {
          errors.push({
            field: `attributes[${i}].trait_type`,
            message: 'Attribute trait_type is required',
            code: 'REQUIRED_FIELD_MISSING'
          });
        }
        if (attr.value === undefined || attr.value === null) {
          errors.push({
            field: `attributes[${i}].value`,
            message: 'Attribute value is required',
            code: 'REQUIRED_FIELD_MISSING'
          });
        }
      }
    }

    if (metadata.rarity && !['COMMON', 'RARE', 'EPIC', 'LEGENDARY'].includes(metadata.rarity)) {
      errors.push({
        field: 'rarity',
        message: 'Metadata rarity must be COMMON, RARE, EPIC, or LEGENDARY',
        code: 'INVALID_ENUM_VALUE'
      });
    }

    return errors;
  }

  /**
   * Validate Starknet address format
   */
  private isValidAddress(address: string): boolean {
    // Basic Starknet address validation
    return /^0x[0-9a-fA-F]{1,64}$/.test(address);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate configuration object
   */
  async validateConfig(config: any): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!config.gameId) {
      errors.push({
        field: 'gameId',
        message: 'Game ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!config.gameName) {
      errors.push({
        field: 'gameName',
        message: 'Game name is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    if (!config.hubEndpoint) {
      errors.push({
        field: 'hubEndpoint',
        message: 'Hub endpoint is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    } else if (!this.isValidUrl(config.hubEndpoint)) {
      errors.push({
        field: 'hubEndpoint',
        message: 'Hub endpoint must be a valid URL',
        code: 'INVALID_URL'
      });
    }

    if (!config.environment || !['development', 'staging', 'production'].includes(config.environment)) {
      errors.push({
        field: 'environment',
        message: 'Environment must be development, staging, or production',
        code: 'INVALID_ENUM_VALUE'
      });
    }

    if (config.environment === 'production' && !config.apiKey) {
      warnings.push({
        field: 'apiKey',
        message: 'API key recommended for production environment',
        suggestion: 'Set apiKey for better security and rate limiting'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}