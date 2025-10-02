import { GraphQLError } from 'graphql';
import { Context } from '../context';

/**
 * Wrapper for caching resolver results
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300,
  context?: Context
): Promise<T> {
  if (!context?.cache) {
    return fetcher();
  }

  try {
    // Try to get from cache first
    const cached = await context.cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache the result
    const result = await fetcher();
    if (result !== null && result !== undefined) {
      await context.cache.set(key, result, ttlSeconds);
    }

    return result;
  } catch (error) {
    // If cache fails, still try to fetch the data
    console.warn(`Cache operation failed for key ${key}:`, error);
    return fetcher();
  }
}

/**
 * Wrapper for error handling in resolvers
 */
export function withErrorHandling<TArgs extends any[], TReturn>(
  resolver: (...args: TArgs) => Promise<TReturn>
) {
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await resolver(...args);
    } catch (error) {
      // If it's already a GraphQLError, re-throw it
      if (error instanceof GraphQLError) {
        throw error;
      }

      // Log the error for debugging
      console.error('Resolver error:', error);

      // Convert to GraphQLError with appropriate code
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new GraphQLError(error.message, {
            extensions: { code: 'NOT_FOUND' }
          });
        }
        
        if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
          throw new GraphQLError('Access denied', {
            extensions: { code: 'FORBIDDEN' }
          });
        }

        if (error.message.includes('invalid') || error.message.includes('validation')) {
          throw new GraphQLError(error.message, {
            extensions: { code: 'INVALID_INPUT' }
          });
        }

        // Network or external service errors
        if (error.message.includes('timeout') || error.message.includes('connection')) {
          throw new GraphQLError('Service temporarily unavailable', {
            extensions: { code: 'SERVICE_UNAVAILABLE' }
          });
        }
      }

      // Generic internal error
      throw new GraphQLError('Internal server error', {
        extensions: { code: 'INTERNAL_ERROR' }
      });
    }
  };
}

/**
 * Rate limiting decorator for resolvers
 */
export function withRateLimit(
  maxRequests: number,
  windowMs: number,
  keyGenerator?: (args: any[], context: Context) => string
) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return function <TArgs extends any[], TReturn>(
    resolver: (...args: TArgs) => Promise<TReturn>
  ) {
    return async (...args: TArgs): Promise<TReturn> => {
      const context = args[2] as Context;
      const key = keyGenerator ? keyGenerator(args, context) : context.user?.id || 'anonymous';
      
      const now = Date.now();
      const userRequests = requests.get(key);

      if (userRequests) {
        if (now < userRequests.resetTime) {
          if (userRequests.count >= maxRequests) {
            throw new GraphQLError('Rate limit exceeded', {
              extensions: { 
                code: 'RATE_LIMITED',
                retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
              }
            });
          }
          userRequests.count++;
        } else {
          // Reset window
          userRequests.count = 1;
          userRequests.resetTime = now + windowMs;
        }
      } else {
        requests.set(key, {
          count: 1,
          resetTime: now + windowMs
        });
      }

      return resolver(...args);
    };
  };
}

/**
 * Input validation decorator
 */
export function withValidation<TArgs extends any[], TReturn>(
  validator: (args: TArgs) => void | Promise<void>
) {
  return function (resolver: (...args: TArgs) => Promise<TReturn>) {
    return async (...args: TArgs): Promise<TReturn> => {
      await validator(args);
      return resolver(...args);
    };
  };
}

/**
 * Permission checking decorator
 */
export function requireAuth(resolver: Function) {
  return withErrorHandling(async (...args: any[]) => {
    const context = args[2] as Context;
    if (!context.user) {
      throw new GraphQLError('Authentication required', {
        extensions: { code: 'UNAUTHENTICATED' }
      });
    }
    return resolver(...args);
  });
}

export function requireAdmin(resolver: Function) {
  return withErrorHandling(async (...args: any[]) => {
    const context = args[2] as Context;
    if (!context.user || !context.user.isAdmin) {
      throw new GraphQLError('Admin access required', {
        extensions: { code: 'FORBIDDEN' }
      });
    }
    return resolver(...args);
  });
}

/**
 * Pagination helper
 */
export function validatePagination(page: number = 1, limit: number = 20) {
  if (page < 1) {
    throw new GraphQLError('Page must be greater than 0', {
      extensions: { code: 'INVALID_INPUT' }
    });
  }
  
  if (limit < 1 || limit > 100) {
    throw new GraphQLError('Limit must be between 1 and 100', {
      extensions: { code: 'INVALID_INPUT' }
    });
  }

  return { page, limit };
}

/**
 * Query complexity analysis helper
 */
export function calculateComplexity(fieldName: string, args: any, childComplexity: number): number {
  // Base complexity for different field types
  const baseComplexity: Record<string, number> = {
    // Simple fields
    'id': 1,
    'displayName': 1,
    'avatar': 1,
    'createdAt': 1,
    
    // Medium complexity fields
    'profile': 5,
    'assets': 10,
    'achievements': 10,
    'friends': 15,
    
    // High complexity fields
    'marketplaceListings': 20,
    'crossGameAssets': 25,
    'playerTransactions': 30,
  };

  let complexity = baseComplexity[fieldName] || 5;

  // Add pagination multiplier
  if (args.limit) {
    complexity *= Math.min(args.limit, 20) / 20;
  }

  // Add child complexity
  complexity += childComplexity;

  return complexity;
}