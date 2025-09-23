"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdapterRegistry = void 0;
class AdapterRegistry {
    constructor(eventService) {
        this.adapters = new Map();
        this.healthCheckInterval = null;
        this.HEALTH_CHECK_INTERVAL_MS = 30000;
        this.eventService = eventService;
        this.startHealthChecking();
    }
    async registerAdapter(adapter, config) {
        const gameId = adapter.gameId;
        if (this.adapters.has(gameId)) {
            throw new Error(`Adapter for game ${gameId} is already registered`);
        }
        this.validateAdapterConfig(config);
        const isHealthy = await adapter.isHealthy();
        const registration = {
            adapter,
            config,
            registeredAt: Date.now(),
            isActive: true,
            lastHealthCheck: Date.now(),
            healthStatus: isHealthy ? 'HEALTHY' : 'UNHEALTHY'
        };
        this.adapters.set(gameId, registration);
        console.log(`Registered adapter for game: ${gameId} (${adapter.gameName})`);
        this.eventService.emit('adapter:registered', { gameId, adapter });
    }
    async unregisterAdapter(gameId) {
        const registration = this.adapters.get(gameId);
        if (!registration) {
            throw new Error(`No adapter registered for game: ${gameId}`);
        }
        try {
            await registration.adapter.unsubscribeFromUpdates();
        }
        catch (error) {
            console.warn(`Error cleaning up adapter ${gameId}:`, error);
        }
        this.adapters.delete(gameId);
        console.log(`Unregistered adapter for game: ${gameId}`);
        this.eventService.emit('adapter:unregistered', { gameId });
    }
    getAdapter(gameId) {
        const registration = this.adapters.get(gameId);
        return registration?.isActive ? registration.adapter : null;
    }
    getAllAdapters() {
        return Array.from(this.adapters.values())
            .filter(reg => reg.isActive)
            .map(reg => reg.adapter);
    }
    getAdaptersByFeature(feature) {
        return this.getAllAdapters().filter(adapter => adapter.supportedFeatures.includes(feature));
    }
    getAdapterInfo(gameId) {
        return this.adapters.get(gameId) || null;
    }
    getAllAdapterInfo() {
        return Array.from(this.adapters.values());
    }
    isGameSupported(gameId) {
        const registration = this.adapters.get(gameId);
        return registration?.isActive === true;
    }
    getSupportedGames() {
        return Array.from(this.adapters.keys()).filter(gameId => {
            const registration = this.adapters.get(gameId);
            return registration?.isActive === true;
        });
    }
    setAdapterActive(gameId, active) {
        const registration = this.adapters.get(gameId);
        if (!registration) {
            throw new Error(`No adapter registered for game: ${gameId}`);
        }
        registration.isActive = active;
        console.log(`Adapter ${gameId} ${active ? 'activated' : 'deactivated'}`);
    }
    async performHealthChecks() {
        const healthCheckPromises = Array.from(this.adapters.entries()).map(async ([gameId, registration]) => {
            if (!registration.isActive)
                return;
            try {
                const isHealthy = await registration.adapter.isHealthy();
                const newStatus = isHealthy ? 'HEALTHY' : 'UNHEALTHY';
                if (registration.healthStatus !== newStatus) {
                    registration.healthStatus = newStatus;
                    this.eventService.emit('adapter:health_changed', { gameId, status: newStatus });
                }
                registration.lastHealthCheck = Date.now();
            }
            catch (error) {
                const gameError = registration.adapter.handleError(error);
                registration.healthStatus = 'UNHEALTHY';
                console.error(`Health check failed for adapter ${gameId}:`, gameError);
                this.eventService.emit('adapter:error', { gameId, error: gameError });
                this.eventService.emit('adapter:health_changed', { gameId, status: 'UNHEALTHY' });
            }
        });
        await Promise.allSettled(healthCheckPromises);
    }
    getHealthSummary() {
        let healthy = 0;
        let degraded = 0;
        let unhealthy = 0;
        let inactive = 0;
        for (const registration of this.adapters.values()) {
            if (!registration.isActive) {
                inactive++;
            }
            else {
                switch (registration.healthStatus) {
                    case 'HEALTHY':
                        healthy++;
                        break;
                    case 'DEGRADED':
                        degraded++;
                        break;
                    case 'UNHEALTHY':
                        unhealthy++;
                        break;
                }
            }
        }
        return {
            total: this.adapters.size,
            healthy,
            degraded,
            unhealthy,
            inactive
        };
    }
    startHealthChecking() {
        this.healthCheckInterval = setInterval(() => this.performHealthChecks(), this.HEALTH_CHECK_INTERVAL_MS);
    }
    stopHealthChecking() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
    validateAdapterConfig(config) {
        if (!config.gameId) {
            throw new Error('Game ID is required');
        }
        if (!config.gameName) {
            throw new Error('Game name is required');
        }
        if (!config.contractAddress) {
            throw new Error('Contract address is required');
        }
        if (!config.rpcEndpoint) {
            throw new Error('RPC endpoint is required');
        }
        if (!config.retryConfig) {
            throw new Error('Retry configuration is required');
        }
        if (!config.cacheConfig) {
            throw new Error('Cache configuration is required');
        }
        const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier } = config.retryConfig;
        if (maxRetries < 0 || maxRetries > 10) {
            throw new Error('Max retries must be between 0 and 10');
        }
        if (baseDelayMs < 100 || baseDelayMs > 10000) {
            throw new Error('Base delay must be between 100ms and 10s');
        }
        if (maxDelayMs < baseDelayMs) {
            throw new Error('Max delay must be greater than base delay');
        }
        if (backoffMultiplier < 1 || backoffMultiplier > 5) {
            throw new Error('Backoff multiplier must be between 1 and 5');
        }
        const { ttlSeconds, maxEntries } = config.cacheConfig;
        if (ttlSeconds < 60 || ttlSeconds > 3600) {
            throw new Error('Cache TTL must be between 60s and 1 hour');
        }
        if (maxEntries < 100 || maxEntries > 10000) {
            throw new Error('Max cache entries must be between 100 and 10000');
        }
    }
    async destroy() {
        this.stopHealthChecking();
        const gameIds = Array.from(this.adapters.keys());
        for (const gameId of gameIds) {
            try {
                await this.unregisterAdapter(gameId);
            }
            catch (error) {
                console.error(`Error unregistering adapter ${gameId}:`, error);
            }
        }
    }
}
exports.AdapterRegistry = AdapterRegistry;
//# sourceMappingURL=AdapterRegistry.js.map