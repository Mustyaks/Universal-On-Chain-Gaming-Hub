"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameWebSocketEndpoints = exports.knownContractAddresses = exports.productionConfig = exports.developmentConfig = exports.defaultRealtimeConfig = exports.defaultValidationConfig = exports.defaultSyncConfig = exports.defaultRedisConfig = void 0;
exports.createRealtimeConfig = createRealtimeConfig;
exports.defaultRedisConfig = {
    url: process.env['REDIS_URL'] || 'redis://localhost:6379',
    keyPrefix: 'gaming-hub',
    defaultTTL: 3600,
    maxRetries: 3,
    retryDelay: 1000
};
exports.defaultSyncConfig = {
    redis: {
        url: process.env['REDIS_URL'] || 'redis://localhost:6379',
        keyPrefix: 'gaming-hub-sync'
    },
    websocket: {
        port: parseInt(process.env['WS_PORT'] || '8080'),
        heartbeatInterval: 30000,
        maxConnections: 1000
    },
    validation: {
        enableIntegrityChecks: true,
        maxDataAge: 300000,
        requiredFields: [
            'playerId',
            'gameId',
            'lastUpdated'
        ]
    }
};
exports.defaultValidationConfig = {
    enableStrictValidation: process.env['NODE_ENV'] === 'production',
    maxDataAge: 300000,
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
exports.defaultRealtimeConfig = {
    sync: exports.defaultSyncConfig,
    redis: exports.defaultRedisConfig,
    validation: exports.defaultValidationConfig,
    aggregation: {
        batchSize: 50,
        flushInterval: 5000,
        enableMetrics: true
    }
};
exports.developmentConfig = {
    ...exports.defaultRealtimeConfig,
    validation: {
        ...exports.defaultValidationConfig,
        enableStrictValidation: false
    },
    aggregation: {
        ...exports.defaultRealtimeConfig.aggregation,
        batchSize: 10,
        flushInterval: 2000
    }
};
exports.productionConfig = {
    ...exports.defaultRealtimeConfig,
    validation: {
        ...exports.defaultValidationConfig,
        enableStrictValidation: true
    },
    aggregation: {
        ...exports.defaultRealtimeConfig.aggregation,
        batchSize: 100,
        flushInterval: 10000
    }
};
function createRealtimeConfig(environment = 'development') {
    switch (environment) {
        case 'production':
            return exports.productionConfig;
        case 'test':
            return {
                ...exports.developmentConfig,
                redis: {
                    ...exports.defaultRedisConfig,
                    url: process.env['REDIS_TEST_URL'] || 'redis://localhost:6380'
                },
                sync: {
                    ...exports.defaultSyncConfig,
                    websocket: {
                        ...exports.defaultSyncConfig.websocket,
                        port: 8081
                    }
                }
            };
        default:
            return exports.developmentConfig;
    }
}
exports.knownContractAddresses = [
    '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
];
exports.gameWebSocketEndpoints = {
    'dojo-chess': process.env['DOJO_CHESS_WS'] || 'ws://localhost:3001/ws',
    'dojo-rpg': process.env['DOJO_RPG_WS'] || 'ws://localhost:3002/ws',
    'dojo-strategy': process.env['DOJO_STRATEGY_WS'] || 'ws://localhost:3003/ws'
};
//# sourceMappingURL=realtimeConfig.js.map