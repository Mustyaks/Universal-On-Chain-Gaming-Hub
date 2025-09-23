/**
 * SDK Type definitions for Dojo game integration
 */

import { GameAdapter, GameAdapterConfig } from '../../services/aggregation/GameAdapter';
import { StandardizedGameData, PlayerGameData, GameAsset, Achievement } from '../../types/core';

// SDK Configuration
export interface SDKConfig {
  hubEndpoint: string;
  gameId: string;
  gameName: string;
  apiKey?: string;
  environment: 'development' | 'staging' | 'production';
  retryConfig?: RetryConfig;
  cacheConfig?: CacheConfig;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface CacheConfig {
  ttlSeconds: number;
  maxEntries: number;
  enableCache: boolean;
}

// Plugin Adapter Interface
export interface PluginAdapter extends GameAdapter {
  // Additional SDK-specific methods
  initialize(config: SDKConfig): Promise<void>;
  shutdown(): Promise<void>;
  getIntegrationStatus(): IntegrationStatus;
}

export interface IntegrationStatus {
  connected: boolean;
  lastSync: number;
  errors: IntegrationError[];
  metrics: IntegrationMetrics;
}

export interface IntegrationError {
  code: string;
  message: string;
  timestamp: number;
  resolved: boolean;
}

export interface IntegrationMetrics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageResponseTime: number;
  lastSyncDuration: number;
}

// Data Transformation Interfaces
export interface DataTransformer<TInput = any, TOutput = any> {
  transform(input: TInput): Promise<TOutput>;
  validate(input: TInput): Promise<boolean>;
}

export interface AssetTransformer extends DataTransformer<any, GameAsset> {
  transformAsset(rawAsset: any): Promise<GameAsset>;
  validateAssetStructure(rawAsset: any): Promise<boolean>;
}

export interface AchievementTransformer extends DataTransformer<any, Achievement> {
  transformAchievement(rawAchievement: any): Promise<Achievement>;
  validateAchievementStructure(rawAchievement: any): Promise<boolean>;
}

// Event System
export interface SDKEventEmitter {
  on(event: SDKEvent, handler: (...args: any[]) => void): void;
  off(event: SDKEvent, handler: (...args: any[]) => void): void;
  emit(event: SDKEvent, ...args: any[]): void;
}

export type SDKEvent = 
  | 'connected'
  | 'disconnected'
  | 'dataSync'
  | 'error'
  | 'playerUpdate'
  | 'assetChange'
  | 'achievementEarned';

// Validation and Testing
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// Health Monitoring
export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  lastChecked: number;
}

export interface DiagnosticInfo {
  sdkVersion: string;
  gameId: string;
  environment: string;
  uptime: number;
  healthChecks: HealthCheck[];
  integrationStatus: IntegrationStatus;
}

// Webhook Configuration
export interface WebhookConfig {
  url: string;
  events: SDKEvent[];
  secret?: string;
  retryConfig?: RetryConfig;
}

// Plugin System
export interface PluginDefinition {
  name: string;
  version: string;
  description: string;
  author: string;
  dependencies?: string[];
  config?: Record<string, any>;
}

export interface Plugin {
  definition: PluginDefinition;
  initialize(sdk: any): Promise<void>;
  shutdown(): Promise<void>;
}

// Batch Operations
export interface BatchOperation<T> {
  items: T[];
  batchSize: number;
  concurrency: number;
  onProgress?: (completed: number, total: number) => void;
  onError?: (error: Error, item: T) => void;
}

export interface BatchResult<T> {
  successful: T[];
  failed: Array<{ item: T; error: Error }>;
  totalProcessed: number;
  duration: number;
}