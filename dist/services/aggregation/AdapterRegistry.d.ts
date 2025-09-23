import { GameAdapter, GameAdapterConfig, GameFeature } from './GameAdapter';
import { GameHubError } from '../../types/core';
import { EventService } from '../../types/services';
export interface AdapterRegistration {
    adapter: GameAdapter;
    config: GameAdapterConfig;
    registeredAt: number;
    isActive: boolean;
    lastHealthCheck: number;
    healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
}
export interface RegistryEvents {
    'adapter:registered': {
        gameId: string;
        adapter: GameAdapter;
    };
    'adapter:unregistered': {
        gameId: string;
    };
    'adapter:health_changed': {
        gameId: string;
        status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    };
    'adapter:error': {
        gameId: string;
        error: GameHubError;
    };
}
export declare class AdapterRegistry {
    private adapters;
    private eventService;
    private healthCheckInterval;
    private readonly HEALTH_CHECK_INTERVAL_MS;
    constructor(eventService: EventService);
    registerAdapter(adapter: GameAdapter, config: GameAdapterConfig): Promise<void>;
    unregisterAdapter(gameId: string): Promise<void>;
    getAdapter(gameId: string): GameAdapter | null;
    getAllAdapters(): GameAdapter[];
    getAdaptersByFeature(feature: GameFeature): GameAdapter[];
    getAdapterInfo(gameId: string): AdapterRegistration | null;
    getAllAdapterInfo(): AdapterRegistration[];
    isGameSupported(gameId: string): boolean;
    getSupportedGames(): string[];
    setAdapterActive(gameId: string, active: boolean): void;
    performHealthChecks(): Promise<void>;
    getHealthSummary(): {
        total: number;
        healthy: number;
        degraded: number;
        unhealthy: number;
        inactive: number;
    };
    private startHealthChecking;
    stopHealthChecking(): void;
    private validateAdapterConfig;
    destroy(): Promise<void>;
}
//# sourceMappingURL=AdapterRegistry.d.ts.map