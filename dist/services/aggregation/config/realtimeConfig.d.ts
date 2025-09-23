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
export declare const defaultRedisConfig: RedisEventConfig;
export declare const defaultSyncConfig: RealtimeSyncConfig;
export declare const defaultValidationConfig: ValidationConfig;
export declare const defaultRealtimeConfig: RealtimeAggregationConfig;
export declare const developmentConfig: RealtimeAggregationConfig;
export declare const productionConfig: RealtimeAggregationConfig;
export declare function createRealtimeConfig(environment?: 'development' | 'production' | 'test'): RealtimeAggregationConfig;
export declare const knownContractAddresses: string[];
export declare const gameWebSocketEndpoints: Record<string, string>;
//# sourceMappingURL=realtimeConfig.d.ts.map