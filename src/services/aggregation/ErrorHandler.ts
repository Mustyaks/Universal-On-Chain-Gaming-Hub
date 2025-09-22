/**
 * Centralized error handling and retry mechanisms for game adapters
 * Provides consistent error classification, retry logic, and recovery strategies
 */

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

export class ErrorHandler {
  private static readonly DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: ['NETWORK_ERROR', 'EXTERNAL_SERVICE_ERROR']
  };

  /**
   * Execute an operation with retry logic
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {},
    context: string = 'unknown'
  ): Promise<T> {
    const config = { ...this.DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: any;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        const gameError = this.classifyError(error);
        
        // Don't retry if error is not retryable
        if (!config.retryableErrors.includes(gameError.code)) {
          throw gameError;
        }
        
        // Don't retry on last attempt
        if (attempt === config.maxRetries) {
          throw gameError;
        }
        
        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelayMs
        );
        
        console.warn(
          `Operation ${context} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`,
          gameError
        );
        
        await this.sleep(delay);
      }
    }
    
    throw this.classifyError(lastError);
  }

  /**
   * Classify errors into standardized GameHubError format
   */
  static classifyError(error: any): GameHubError {
    const timestamp = Date.now();
    
    // Network-related errors
    if (this.isNetworkError(error)) {
      return {
        code: 'NETWORK_ERROR',
        message: `Network error: ${error.message}`,
        details: { originalError: error, type: 'network' },
        timestamp
      };
    }
    
    // Authentication errors
    if (this.isAuthError(error)) {
      return {
        code: 'AUTH_ERROR',
        message: `Authentication error: ${error.message}`,
        details: { originalError: error, type: 'auth' },
        timestamp
      };
    }
    
    // Data integrity errors
    if (this.isDataIntegrityError(error)) {
      return {
        code: 'DATA_INTEGRITY_ERROR',
        message: `Data integrity error: ${error.message}`,
        details: { originalError: error, type: 'data_integrity' },
        timestamp
      };
    }
    
    // Business logic errors
    if (this.isBusinessLogicError(error)) {
      return {
        code: 'BUSINESS_LOGIC_ERROR',
        message: `Business logic error: ${error.message}`,
        details: { originalError: error, type: 'business_logic' },
        timestamp
      };
    }
    
    // Default to external service error
    return {
      code: 'EXTERNAL_SERVICE_ERROR',
      message: `External service error: ${error.message || 'Unknown error'}`,
      details: { originalError: error, type: 'external_service' },
      timestamp
    };
  }

  /**
   * Check if error is network-related
   */
  private static isNetworkError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      code === 'network_error' ||
      error.name === 'NetworkError' ||
      (error.response && error.response.status >= 500)
    );
  }

  /**
   * Check if error is authentication-related
   */
  private static isAuthError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    
    return (
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('invalid token') ||
      message.includes('expired') ||
      code === 'auth_error' ||
      (error.response && [401, 403].includes(error.response.status))
    );
  }

  /**
   * Check if error is data integrity-related
   */
  private static isDataIntegrityError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    
    return (
      message.includes('validation') ||
      message.includes('invalid data') ||
      message.includes('corrupt') ||
      message.includes('checksum') ||
      code === 'data_integrity_error' ||
      (error.response && error.response.status === 422)
    );
  }

  /**
   * Check if error is business logic-related
   */
  private static isBusinessLogicError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    
    return (
      message.includes('insufficient') ||
      message.includes('not allowed') ||
      message.includes('invalid operation') ||
      message.includes('business rule') ||
      code === 'business_logic_error' ||
      (error.response && error.response.status === 400)
    );
  }

  /**
   * Sleep utility for delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker pattern implementation for external service calls
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      monitoringPeriodMs: 300000, // 5 minutes
      ...options
    };
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>, context: string = 'unknown'): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        console.log(`Circuit breaker ${context}: transitioning to HALF_OPEN`);
      } else {
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
    } catch (error) {
      this.recordFailure();
      
      if (this.failures >= this.options.failureThreshold) {
        this.state = 'OPEN';
        console.error(`Circuit breaker ${context}: transitioning to OPEN after ${this.failures} failures`);
      }
      
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
  }

  /**
   * Record a failure
   */
  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }
}

/**
 * Utility class for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker for a service
   */
  getBreaker(serviceName: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(options));
    }
    
    return this.breakers.get(serviceName)!;
  }

  /**
   * Execute operation through named circuit breaker
   */
  async execute<T>(
    serviceName: string,
    operation: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>
  ): Promise<T> {
    const breaker = this.getBreaker(serviceName, options);
    return breaker.execute(operation, serviceName);
  }

  /**
   * Get status of all circuit breakers
   */
  getStatus(): Record<string, { state: string; failures: number }> {
    const status: Record<string, { state: string; failures: number }> = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      status[name] = {
        state: breaker.getState(),
        failures: breaker.getFailureCount()
      };
    }
    
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Reset specific circuit breaker
   */
  reset(serviceName: string): void {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.reset();
    }
  }
}