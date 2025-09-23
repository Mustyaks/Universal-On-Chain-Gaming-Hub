/**
 * Configuration for real-time synchronization services
 */

import { RealtimeSyncConfig } from '../RealtimeSyncService';
import { RedisEventConfig } from '../RedisEventManager';
import { ValidationConfig } from '../DataValidationService';

export interface RealtimeAggregationConfig {
    sync: RealtimeSyncConfig;
    redis: RedisEventConfig;
    validation: ValidationConfig;
    aggregation: {
        batchSize: number;
        flushInterval: number;
        enableMetrics: boolean;
    };
}

// Default Redis configuration
export const defaultRedisConfig: RedisEventConfig = {
    url: process.env['REDIS_URL'] || 'redis://localhost:6379',
    keyPrefix: 'gaming-hub',
    defaultTTL: 3600, // 1 hour
    maxRetries: 3,
    retryDelay: 1000
};

// Default WebSocket and sync configuration
export const defaultSyncConfig: RealtimeSyncConfig = {
    redis: {
        url: process.env['REDIS_URL'] || 'redis://localhost:6379',
        keyPrefix: 'gaming-hub-sync'
    },
    websocket: {
        port: parseInt(process.env['WS_PORT'] || '8080'),
        heartbeatInterval: 30000, // 30 seconds
        maxConnections: 1000
    },
    validation: {
        enableIntegrityChecks: true,
        maxDataAge: 300000, // 5 minutes
        requiredFields: [
            'playerId',
            'gameId',
            'lastUpdated'
        ]
    }
};

// Default validation configuration
export const defaultValidationConfig: ValidationConfig = {
    enableStrictValidation: process.env['NODE_ENV'] === 'production',
    maxDataAge: 300000, // 5 minutes
    requiredFields: {
        gameData: [
            'playerId',
            'gameId',
            'lastUpdated'
        ],
        assets: [
            'id',
            'gameId',
            'tokenId',
            'contractAddress',
            'owner'
        ],
        achievements: [
            'id',
            'gameId',
            'playerId',
            'title',
            'earnedAt'
        ],
        statistics: [
            'gameId',
            'playerId'
        ]
    },
    assetValidation: {
        validateContractAddresses: true,
        validateOwnership: true,
        checkDuplicates: true
    },
    achievementValidation: {
        validateTimestamps: true,
        checkDuplicates: true,
        validateRarity: true
    }
};

// Complete real-time aggregation configuration
export const defaultRealtimeConfig: RealtimeAggregationConfig = {
    sync: defaultSyncConfig,
    redis: defaultRedisConfig,
    validation: defaultValidationConfig,
    aggregation: {
        batchSize: 50,
        flushInterval: 5000, // 5 seconds
        enableMetrics: true
    }
};

// Environment-specific configurations
export const developmentConfig: RealtimeAggregationConfig = {
    ...defaultRealtimeConfig,
    validation: {
        ...defaultValidationConfig,
        enableStrictValidation: false
    },
    aggregation: {
        ...defaultRealtimeConfig.aggregation,
        batchSize: 10,
        flushInterval: 2000 // 2 seconds for faster development feedback
    }
};

export const productionConfig: RealtimeAggregationConfig = {
    ...defaultRealtimeConfig,
    validation: {
        ...defaultValidationConfig,
        enableStrictValidation: true
    },
    aggregation: {
        ...defaultRealtimeConfig.aggregation,
        batchSize: 100,
        flushInterval: 10000 // 10 seconds for production efficiency
    }
};

// Configuration factory
export function createRealtimeConfig(environment: 'development' | 'production' | 'test' = 'development'): RealtimeAggregationConfig {
    switch (environment) {
        case 'production':
            return productionConfig;
        case 'test':
            return {
                ...developmentConfig,
                redis: {
                    ...defaultRedisConfig,
                    url: process.env['REDIS_TEST_URL'] || 'redis://localhost:6380'
                },
                sync: {
                    ...defaultSyncConfig,
                    websocket: {
                        ...defaultSyncConfig.websocket,
                        port: 8081 // Different port for tests
                    }
                }
            };
        default:
            return developmentConfig;
    }
}

// Known contract addresses for validation (example)
export const knownContractAddresses = [
    '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', // ETH on Starknet
    '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8', // USDC on Starknet
    // Add more known contract addresses as needed
];

// Game-specific WebSocket endpoints (example)
export const gameWebSocketEndpoints: Record<string, string> = {
    'dojo-chess': process.env['DOJO_CHESS_WS'] || 'ws://localhost:3001/ws',
    'dojo-rpg': process.env['DOJO_RPG_WS'] || 'ws://localhost:3002/ws',
    'dojo-strategy': process.env['DOJO_STRATEGY_WS'] || 'ws://localhost:3003/ws'
};