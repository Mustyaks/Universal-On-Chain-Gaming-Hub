import { Request, Response } from 'express';
import { PubSub } from 'graphql-subscriptions';
import {
  ProfileService,
  MarketplaceService,
  SocialService,
  AggregationService,
  NotificationService,
  CacheService,
  AuthService
} from '../types/services';

export interface User {
  id: string;
  cartridgeId: string;
  walletAddress: string;
  isAdmin?: boolean;
}

export interface Services {
  profileService: ProfileService;
  marketplaceService: MarketplaceService;
  socialService: SocialService;
  aggregationService: AggregationService;
  notificationService: NotificationService;
  authService: AuthService;
}

export interface Context {
  req: Request;
  res: Response;
  user?: User;
  services: Services;
  cache: CacheService;
  pubsub: PubSub;
  dataSources?: any;
}

export interface GraphQLContext extends Context {
  // Additional GraphQL-specific context properties
  operationName?: string;
  query?: string;
  variables?: Record<string, any>;
}

/**
 * Create GraphQL context from Express request/response
 */
export async function createContext(
  req: Request,
  res: Response,
  services: Services,
  cache: CacheService,
  pubsub: PubSub
): Promise<Context> {
  let user: User | undefined;

  // Extract authentication token from headers
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      // Validate session token and get user
      const player = await services.authService.validateSession(token);
      user = {
        id: player.id,
        cartridgeId: player.cartridgeId,
        walletAddress: player.walletAddress,
        isAdmin: false // This would be determined from user roles
      };
    } catch (error) {
      // Invalid token - user remains undefined
      console.warn('Invalid authentication token:', error);
    }
  }

  return {
    req,
    res,
    user,
    services,
    cache,
    pubsub
  };
}

/**
 * Create context for subscriptions (WebSocket connections)
 */
export async function createSubscriptionContext(
  connectionParams: any,
  services: Services,
  cache: CacheService,
  pubsub: PubSub
): Promise<Partial<Context>> {
  let user: User | undefined;

  // Extract authentication from connection params
  if (connectionParams?.authorization) {
    const token = connectionParams.authorization.replace('Bearer ', '');
    
    try {
      const player = await services.authService.validateSession(token);
      user = {
        id: player.id,
        cartridgeId: player.cartridgeId,
        walletAddress: player.walletAddress,
        isAdmin: false
      };
    } catch (error) {
      console.warn('Invalid subscription authentication:', error);
    }
  }

  return {
    user,
    services,
    cache,
    pubsub
  };
}