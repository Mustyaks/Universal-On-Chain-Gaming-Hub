import { RealtimeAggregationService } from '../RealtimeAggregationService';
export declare function setupRealtimeSync(): Promise<RealtimeAggregationService>;
export declare function subscribeToPlayerUpdates(aggregationService: RealtimeAggregationService, playerId: string): Promise<void>;
export declare function processManualUpdate(aggregationService: RealtimeAggregationService, playerId: string, gameId: string): Promise<void>;
export declare function monitorSystemHealth(aggregationService: RealtimeAggregationService): Promise<void>;
export declare function runRealtimeSyncExample(): Promise<void>;
//# sourceMappingURL=realtimeExample.d.ts.map