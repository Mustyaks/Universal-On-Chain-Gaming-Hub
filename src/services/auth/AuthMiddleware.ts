import { Request, Response, NextFunction } from 'express';
import { CartridgeAuthService } from './CartridgeAuthService';
import { Player } from '../../types/core';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: Player;
      sessionToken?: string;
    }
  }
}

export interface AuthMiddlewareConfig {
  authService: CartridgeAuthService;
  skipPaths?: string[];
  requireAuth?: boolean;
}

export class AuthMiddleware {
  constructor(private config: AuthMiddlewareConfig) {}

  /**
   * Express middleware for authentication
   */
  authenticate() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Skip authentication for certain paths
        if (this.config.skipPaths?.some(path => req.path.startsWith(path))) {
          return next();
        }

        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          if (this.config.requireAuth) {
            return res.status(401).json({
              error: 'Authentication required',
              code: 'UNAUTHENTICATED'
            });
          }
          return next();
        }

        const token = authHeader.substring(7);
        req.sessionToken = token;

        // Validate session
        const user = await this.config.authService.validateSession(token);
        req.user = user;

        next();
      } catch (error) {
        if (this.config.requireAuth) {
          return res.status(401).json({
            error: error.message,
            code: 'UNAUTHENTICATED'
          });
        }
        
        // If auth is optional, continue without user
        next();
      }
    };
  }

  /**
   * Middleware that requires authentication
   */
  requireAuth() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED'
        });
      }
      next();
    };
  }

  /**
   * Middleware that requires admin privileges
   */
  requireAdmin() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED'
        });
      }

      // Check if user is admin (this would be determined from user roles/permissions)
      // For now, we'll use a simple check
      const isAdmin = false; // This would be fetched from user profile or roles
      
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Admin access required',
          code: 'FORBIDDEN'
        });
      }

      next();
    };
  }

  /**
   * Middleware for role-based access control
   */
  requireRole(roles: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED'
        });
      }

      // Check user roles (this would be implemented based on your role system)
      const userRoles: string[] = []; // This would be fetched from user profile
      
      const hasRequiredRole = roles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN'
        });
      }

      next();
    };
  }

  /**
   * Middleware for resource ownership validation
   */
  requireOwnership(resourceIdParam: string = 'playerId') {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED'
        });
      }

      const resourceId = req.params[resourceIdParam] || req.body[resourceIdParam];
      
      if (req.user.id !== resourceId) {
        return res.status(403).json({
          error: 'Access denied - resource not owned by user',
          code: 'FORBIDDEN'
        });
      }

      next();
    };
  }
}