/**
 * Configuration validation utilities for SDK
 * Validates SDK and adapter configurations
 */

import { SDKConfig, ValidationResult, ValidationError, ValidationWarning } from '../types';
import { GameAdapterConfig } from '../../services/aggregation/GameAdapter';

export class ConfigValidator {
  /**
   * Validate SDK configuration
   */
  async validateSDKConfig(config: SDKConfig): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields validation
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

    if (!config.gameId) {
      errors.push({
        field: 'gameId',
        message: 'Game ID is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    } else if (!this.isValidGameId(config.gameId)) {
      errors.push({
        field: 'gameId',
        message: 'Game ID must be alphanumeric with hyphens only',
        code: 'INVALID_FORMAT'
      });
    }

    if (!config.gameName) {
      errors.push({
        field: 'gameName',
        message: 'Game name is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    } else if (config.gameName.length > 100) {
      warnings.push({
        field: 'gameName',
        message: 'Game name is very long',
        suggestion: 'Consider using a shorter game name for better display'
      });
    }

    if (!config.environment) {
      errors.push({
        field: 'environment',
        message: 'Environment is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    } else if (!['development', 'staging', 'production'].includes(config.environment)) {
      errors.push({
        field: 'environment',
        message: 'Environment must be development, staging, or production',
        code: 'INVALID_ENUM_VALUE'
      });
    }

    // Optional fields validation
    if (config.apiKey) {
      if (config.apiKey.length < 16) {
        warnings.push({
          field: 'apiKey',
          message: 'API key seems short',
          suggestion: 'Ensure API key is valid and secure'
        });
      }
    } else if (config.environment === 'production') {
      warnings.push({
        field: 'apiKey',
        message: 'API key not provided for production environment',
        suggestion: 'Consider using API key for better security and rate limiting'
      });
    }

    // Retry configuration validation
    if (config.retryConfig) {
      const retryValidation = this.validateRetryConfig(config.retryConfig);
      errors.push(...retryValidation.errors);
      warnings.push(...retryValidation.warnings);
    }

    // Cache configuration validation
    if (config.cacheConfig) {
      const cacheValidation = this.validateCacheConfig(config.cacheConfig);
      errors.push(...cacheValidation.errors);
      warnings.push(...cacheValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate game adapter configuration
   */
  async validateAdapterConfig(config: GameAdapterConfig): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields validation
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

    if (!config.contractAddress) {
      errors.push({
        field: 'contractAddress',
        message: 'Contract address is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    } else if (!this.isValidStarknetAddress(config.contractAddress)) {
      errors.push({
        field: 'contractAddress',
        message: 'Invalid Starknet contract address format',
        code: 'INVALID_ADDRESS'
      });
    }

    if (!config.rpcEndpoint) {
      errors.push({
        field: 'rpcEndpoint',
        message: 'RPC endpoint is required',
        code: 'REQUIRED_FIELD_MISSING'
      });
    } else if (!this.isValidUrl(config.rpcEndpoint)) {
      errors.push({
        field: 'rpcEndpoint',
        message: 'RPC endpoint must be a valid URL',
        code: 'INVALID_URL'
      });
    }

    // Optional fields validation
    if (config.wsEndpoint) {
      if (!this.isValidWebSocketUrl(config.wsEndpoint)) {
        errors.push({
          field: 'wsEndpoint',
          message: 'WebSocket endpoint must be a valid WebSocket URL',
          code: 'INVALID_WEBSOCKET_URL'
        });
      }
    } else {
      warnings.push({
        field: 'wsEndpoint',
        message: 'WebSocket endpoint not provided',
        suggestion: 'Real-time updates will be disabled without WebSocket endpoint'
      });
    }

    // Configuration validation
    if (config.retryConfig) {
      const retryValidation = this.validateRetryConfig(config.retryConfig);
      errors.push(...retryValidation.errors.map(e => ({ ...e, field: `retryConfig.${e.field}` })));
      warnings.push(...retryValidation.warnings.map(w => ({ ...w, field: `retryConfig.${w.field}` })));
    }

    if (config.cacheConfig) {
      const cacheValidation = this.validateCacheConfig(config.cacheConfig);
      errors.push(...cacheValidation.errors.map(e => ({ ...e, field: `cacheConfig.${e.field}` })));
      warnings.push(...cacheValidation.warnings.map(w => ({ ...w, field: `cacheConfig.${w.field}` })));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate retry configuration
   */
  private validateRetryConfig(config: any): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof config.maxRetries !== 'number' || config.maxRetries < 0) {
      errors.push({
        field: 'maxRetries',
        message: 'Max retries must be a non-negative number',
        code: 'INVALID_NUMBER'
      });
    } else if (config.maxRetries > 10) {
      warnings.push({
        field: 'maxRetries',
        message: 'High retry count may cause performance issues',
        suggestion: 'Consider using a lower retry count'
      });
    }

    if (typeof config.baseDelayMs !== 'number' || config.baseDelayMs < 0) {
      errors.push({
        field: 'baseDelayMs',
        message: 'Base delay must be a non-negative number',
        code: 'INVALID_NUMBER'
      });
    }

    if (typeof config.maxDelayMs !== 'number' || config.maxDelayMs < 0) {
      errors.push({
        field: 'maxDelayMs',
        message: 'Max delay must be a non-negative number',
        code: 'INVALID_NUMBER'
      });
    } else if (config.maxDelayMs > 60000) {
      warnings.push({
        field: 'maxDelayMs',
        message: 'Very high max delay may cause poor user experience',
        suggestion: 'Consider using a lower max delay'
      });
    }

    if (config.baseDelayMs && config.maxDelayMs && config.baseDelayMs > config.maxDelayMs) {
      errors.push({
        field: 'baseDelayMs',
        message: 'Base delay cannot be greater than max delay',
        code: 'INVALID_RANGE'
      });
    }

    if (typeof config.backoffMultiplier !== 'number' || config.backoffMultiplier < 1) {
      errors.push({
        field: 'backoffMultiplier',
        message: 'Backoff multiplier must be a number >= 1',
        code: 'INVALID_NUMBER'
      });
    } else if (config.backoffMultiplier > 5) {
      warnings.push({
        field: 'backoffMultiplier',
        message: 'High backoff multiplier may cause very long delays',
        suggestion: 'Consider using a lower backoff multiplier'
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate cache configuration
   */
  private validateCacheConfig(config: any): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof config.ttlSeconds !== 'number' || config.ttlSeconds < 0) {
      errors.push({
        field: 'ttlSeconds',
        message: 'TTL seconds must be a non-negative number',
        code: 'INVALID_NUMBER'
      });
    } else if (config.ttlSeconds < 60) {
      warnings.push({
        field: 'ttlSeconds',
        message: 'Very low TTL may cause excessive API calls',
        suggestion: 'Consider using a higher TTL value'
      });
    } else if (config.ttlSeconds > 3600) {
      warnings.push({
        field: 'ttlSeconds',
        message: 'Very high TTL may cause stale data issues',
        suggestion: 'Consider using a lower TTL value'
      });
    }

    if (typeof config.maxEntries !== 'number' || config.maxEntries < 1) {
      errors.push({
        field: 'maxEntries',
        message: 'Max entries must be a positive number',
        code: 'INVALID_NUMBER'
      });
    } else if (config.maxEntries > 10000) {
      warnings.push({
        field: 'maxEntries',
        message: 'Very high max entries may cause memory issues',
        suggestion: 'Consider using a lower max entries value'
      });
    }

    if (typeof config.enableCache !== 'boolean') {
      errors.push({
        field: 'enableCache',
        message: 'Enable cache must be a boolean',
        code: 'INVALID_TYPE'
      });
    }

    return { errors, warnings };
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
   * Validate WebSocket URL format
   */
  private isValidWebSocketUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:';
    } catch {
      return false;
    }
  }

  /**
   * Validate Starknet address format
   */
  private isValidStarknetAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{1,64}$/.test(address);
  }

  /**
   * Validate game ID format
   */
  private isValidGameId(gameId: string): boolean {
    return /^[a-zA-Z0-9-]+$/.test(gameId) && gameId.length >= 3 && gameId.length <= 50;
  }

  /**
   * Generate configuration recommendations
   */
  generateRecommendations(config: SDKConfig): string[] {
    const recommendations: string[] = [];

    // Environment-specific recommendations
    if (config.environment === 'production') {
      if (!config.apiKey) {
        recommendations.push('Use API key for production environment');
      }
      
      if (!config.retryConfig || config.retryConfig.maxRetries < 3) {
        recommendations.push('Use higher retry count for production reliability');
      }
      
      if (!config.cacheConfig || !config.cacheConfig.enableCache) {
        recommendations.push('Enable caching for production performance');
      }
    }

    if (config.environment === 'development') {
      if (config.cacheConfig && config.cacheConfig.ttlSeconds > 300) {
        recommendations.push('Use lower cache TTL for development to see changes quickly');
      }
    }

    // Performance recommendations
    if (config.retryConfig && config.retryConfig.maxRetries > 5) {
      recommendations.push('Consider reducing retry count to avoid long delays');
    }

    if (config.cacheConfig && config.cacheConfig.maxEntries > 5000) {
      recommendations.push('Monitor memory usage with high cache entry limits');
    }

    return recommendations;
  }

  /**
   * Validate configuration compatibility
   */
  async validateCompatibility(sdkConfig: SDKConfig, adapterConfig: GameAdapterConfig): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check game ID consistency
    if (sdkConfig.gameId !== adapterConfig.gameId) {
      errors.push({
        field: 'gameId',
        message: 'SDK and adapter game IDs must match',
        code: 'CONFIGURATION_MISMATCH'
      });
    }

    // Check game name consistency
    if (sdkConfig.gameName !== adapterConfig.gameName) {
      warnings.push({
        field: 'gameName',
        message: 'SDK and adapter game names do not match',
        suggestion: 'Ensure consistent naming across configurations'
      });
    }

    // Check environment compatibility
    if (sdkConfig.environment === 'production') {
      if (adapterConfig.rpcEndpoint.includes('localhost') || adapterConfig.rpcEndpoint.includes('127.0.0.1')) {
        errors.push({
          field: 'rpcEndpoint',
          message: 'Cannot use localhost RPC endpoint in production',
          code: 'INVALID_PRODUCTION_CONFIG'
        });
      }

      if (adapterConfig.wsEndpoint && (adapterConfig.wsEndpoint.includes('localhost') || adapterConfig.wsEndpoint.includes('127.0.0.1'))) {
        errors.push({
          field: 'wsEndpoint',
          message: 'Cannot use localhost WebSocket endpoint in production',
          code: 'INVALID_PRODUCTION_CONFIG'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}