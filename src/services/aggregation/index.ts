/**
 * Aggregation Engine - Entry point for game adapter system
 * Exports all components needed for Dojo game integration
 */

// Core interfaces and base classes
export {
  GameAdapter,
  BaseGameAdapter,
  GameAdapterConfig,
  GameFeature,
  RetryConfig,
  CacheConfig
} from './GameAdapter';

// Adapter registry and management
export {
  AdapterRegistry,
  AdapterRegistration,
  RegistryEvents
} from './AdapterRegistry';

// Error handling and resilience
export {
  ErrorHandler,
  CircuitBreaker,
  CircuitBreakerManager,
  RetryOptions,
  CircuitBreakerOptions
} from './ErrorHandler';

// Real-time synchronization
export {
  SyncEngine,
  SyncEngineConfig,
  SyncEvent,
  SyncStatus
} from './SyncEngine';

// Data validation and integrity
export {
  DataValidator,
  ValidationRule,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationConfig
} from './DataValidator';

// Event-driven system
export {
  EventSystem,
  GameEvent,
  GameEventType,
  EventSubscription,
  EventMetrics
} from './EventSystem';

// Caching layer
export {
  CacheManager,
  CacheConfig,
  CacheKey,
  CacheKeyType,
  InvalidationStrategy,
  InvalidationTrigger,
  CacheMetrics,
  CacheEntry
} from './CacheManager';

// Performance monitoring
export {
  PerformanceMonitor,
  PerformanceMetrics,
  SystemMetrics,
  CachePerformanceMetrics,
  AdapterPerformanceMetrics,
  SyncPerformanceMetrics,
  ApiPerformanceMetrics,
  ErrorMetrics,
  PerformanceAlert,
  AlertType,
  AlertThreshold,
  PerformanceConfig
} from './PerformanceMonitor';

// Main aggregation service
export {
  AggregationService,
  AggregationServiceConfig,
  AggregationStatus
} from './AggregationService';

// Concrete adapter implementations
export {
  DojoGameAdapter,
  DojoGameConfig
} from './adapters/DojoGameAdapter';

// Re-export relevant types from core
export {
  StandardizedGameData,
  PlayerGameData,
  GameAsset,
  Achievement,
  GameStatistics,
  GameHubError
} from '../../types/core';

// Re-export service interfaces
export {
  AggregationService as IAggregationService
} from '../../types/services';