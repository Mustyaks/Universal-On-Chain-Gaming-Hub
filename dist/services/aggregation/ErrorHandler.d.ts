import { GameHubError, ErrorCode } from '../../types/core';
export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors: ErrorCode[];
}
export interface CircuitBreakerOptions {
    failureThreshold: number;
    resetTimeoutMs: number;
    monitoringPeriodMs: number;
}
export declare class ErrorHandler {
    private static readonly DEFAULT_RETRY_OPTIONS;
    static executeWithRetry<T>(operation: () => Promise<T>, options?: Partial<RetryOptions>, context?: string): Promise<T>;
    static classifyError(error: any): GameHubError;
    private static isNetworkError;
    private static isAuthError;
    private static isDataIntegrityError;
    private static isBusinessLogicError;
    private static sleep;
}
export declare class CircuitBreaker {
    private failures;
    private lastFailureTime;
    private state;
    private options;
    constructor(options?: Partial<CircuitBreakerOptions>);
    execute<T>(operation: () => Promise<T>, context?: string): Promise<T>;
    getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    getFailureCount(): number;
    reset(): void;
    private recordFailure;
}
export declare class CircuitBreakerManager {
    private breakers;
    getBreaker(serviceName: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker;
    execute<T>(serviceName: string, operation: () => Promise<T>, options?: Partial<CircuitBreakerOptions>): Promise<T>;
    getStatus(): Record<string, {
        state: string;
        failures: number;
    }>;
    resetAll(): void;
    reset(serviceName: string): void;
}
//# sourceMappingURL=ErrorHandler.d.ts.map