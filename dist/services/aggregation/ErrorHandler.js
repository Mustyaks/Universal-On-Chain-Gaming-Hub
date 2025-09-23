"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerManager = exports.CircuitBreaker = exports.ErrorHandler = void 0;
class ErrorHandler {
    static async executeWithRetry(operation, options = {}, context = 'unknown') {
        const config = { ...this.DEFAULT_RETRY_OPTIONS, ...options };
        let lastError;
        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                const gameError = this.classifyError(error);
                if (!config.retryableErrors.includes(gameError.code)) {
                    throw gameError;
                }
                if (attempt === config.maxRetries) {
                    throw gameError;
                }
                const delay = Math.min(config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt), config.maxDelayMs);
                console.warn(`Operation ${context} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`, gameError);
                await this.sleep(delay);
            }
        }
        throw this.classifyError(lastError);
    }
    static classifyError(error) {
        const timestamp = Date.now();
        if (this.isNetworkError(error)) {
            return {
                code: 'NETWORK_ERROR',
                message: `Network error: ${error.message}`,
                details: { originalError: error, type: 'network' },
                timestamp
            };
        }
        if (this.isAuthError(error)) {
            return {
                code: 'AUTH_ERROR',
                message: `Authentication error: ${error.message}`,
                details: { originalError: error, type: 'auth' },
                timestamp
            };
        }
        if (this.isDataIntegrityError(error)) {
            return {
                code: 'DATA_INTEGRITY_ERROR',
                message: `Data integrity error: ${error.message}`,
                details: { originalError: error, type: 'data_integrity' },
                timestamp
            };
        }
        if (this.isBusinessLogicError(error)) {
            return {
                code: 'BUSINESS_LOGIC_ERROR',
                message: `Business logic error: ${error.message}`,
                details: { originalError: error, type: 'business_logic' },
                timestamp
            };
        }
        return {
            code: 'EXTERNAL_SERVICE_ERROR',
            message: `External service error: ${error.message || 'Unknown error'}`,
            details: { originalError: error, type: 'external_service' },
            timestamp
        };
    }
    static isNetworkError(error) {
        if (!error)
            return false;
        const message = error.message?.toLowerCase() || '';
        const code = error.code?.toLowerCase() || '';
        return (message.includes('network') ||
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('econnrefused') ||
            message.includes('enotfound') ||
            code === 'network_error' ||
            error.name === 'NetworkError' ||
            (error.response && error.response.status >= 500));
    }
    static isAuthError(error) {
        if (!error)
            return false;
        const message = error.message?.toLowerCase() || '';
        const code = error.code?.toLowerCase() || '';
        return (message.includes('unauthorized') ||
            message.includes('authentication') ||
            message.includes('invalid token') ||
            message.includes('expired') ||
            code === 'auth_error' ||
            (error.response && [401, 403].includes(error.response.status)));
    }
    static isDataIntegrityError(error) {
        if (!error)
            return false;
        const message = error.message?.toLowerCase() || '';
        const code = error.code?.toLowerCase() || '';
        return (message.includes('validation') ||
            message.includes('invalid data') ||
            message.includes('corrupt') ||
            message.includes('checksum') ||
            code === 'data_integrity_error' ||
            (error.response && error.response.status === 422));
    }
    static isBusinessLogicError(error) {
        if (!error)
            return false;
        const message = error.message?.toLowerCase() || '';
        const code = error.code?.toLowerCase() || '';
        return (message.includes('insufficient') ||
            message.includes('not allowed') ||
            message.includes('invalid operation') ||
            message.includes('business rule') ||
            code === 'business_logic_error' ||
            (error.response && error.response.status === 400));
    }
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ErrorHandler = ErrorHandler;
ErrorHandler.DEFAULT_RETRY_OPTIONS = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: ['NETWORK_ERROR', 'EXTERNAL_SERVICE_ERROR']
};
class CircuitBreaker {
    constructor(options = {}) {
        this.failures = 0;
        this.lastFailureTime = 0;
        this.state = 'CLOSED';
        this.options = {
            failureThreshold: 5,
            resetTimeoutMs: 60000,
            monitoringPeriodMs: 300000,
            ...options
        };
    }
    async execute(operation, context = 'unknown') {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
                this.state = 'HALF_OPEN';
                console.log(`Circuit breaker ${context}: transitioning to HALF_OPEN`);
            }
            else {
                throw new Error(`Circuit breaker ${context} is OPEN - service unavailable`);
            }
        }
        try {
            const result = await operation();
            if (this.state === 'HALF_OPEN') {
                this.reset();
                console.log(`Circuit breaker ${context}: transitioning to CLOSED`);
            }
            return result;
        }
        catch (error) {
            this.recordFailure();
            if (this.failures >= this.options.failureThreshold) {
                this.state = 'OPEN';
                console.error(`Circuit breaker ${context}: transitioning to OPEN after ${this.failures} failures`);
            }
            throw error;
        }
    }
    getState() {
        return this.state;
    }
    getFailureCount() {
        return this.failures;
    }
    reset() {
        this.failures = 0;
        this.lastFailureTime = 0;
        this.state = 'CLOSED';
    }
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
    }
}
exports.CircuitBreaker = CircuitBreaker;
class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
    }
    getBreaker(serviceName, options) {
        if (!this.breakers.has(serviceName)) {
            this.breakers.set(serviceName, new CircuitBreaker(options));
        }
        return this.breakers.get(serviceName);
    }
    async execute(serviceName, operation, options) {
        const breaker = this.getBreaker(serviceName, options);
        return breaker.execute(operation, serviceName);
    }
    getStatus() {
        const status = {};
        for (const [name, breaker] of this.breakers.entries()) {
            status[name] = {
                state: breaker.getState(),
                failures: breaker.getFailureCount()
            };
        }
        return status;
    }
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
    reset(serviceName) {
        const breaker = this.breakers.get(serviceName);
        if (breaker) {
            breaker.reset();
        }
    }
}
exports.CircuitBreakerManager = CircuitBreakerManager;
//# sourceMappingURL=ErrorHandler.js.map