import { Router, Request, Response } from 'express';
import { CartridgeAuthService, CartridgeAuthPayload } from './CartridgeAuthService';
import { AuthMiddleware } from './AuthMiddleware';

export interface AuthRoutesConfig {
  authService: CartridgeAuthService;
  authMiddleware: AuthMiddleware;
}

export class AuthRoutes {
  private router: Router;

  constructor(private config: AuthRoutesConfig) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Authentication endpoints
    this.router.post('/login', this.login.bind(this));
    this.router.post('/login/signature', this.loginWithSignature.bind(this));
    this.router.post('/refresh', this.refreshToken.bind(this));
    this.router.post('/logout', 
      this.config.authMiddleware.authenticate(),
      this.logout.bind(this)
    );
    this.router.post('/logout/all',
      this.config.authMiddleware.requireAuth(),
      this.logoutAll.bind(this)
    );

    // Session management
    this.router.get('/session',
      this.config.authMiddleware.authenticate(),
      this.getSession.bind(this)
    );
    this.router.get('/sessions',
      this.config.authMiddleware.requireAuth(),
      this.getSessions.bind(this)
    );

    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
  }

  /**
   * Basic login with Cartridge ID
   */
  private async login(req: Request, res: Response) {
    try {
      const { cartridgeId } = req.body;

      if (!cartridgeId) {
        return res.status(400).json({
          error: 'Cartridge ID is required',
          code: 'INVALID_INPUT'
        });
      }

      const authResult = await this.config.authService.authenticateWithCartridge(cartridgeId);

      res.json({
        success: true,
        data: {
          player: authResult.player,
          sessionToken: authResult.sessionToken,
          refreshToken: authResult.refreshToken,
          expiresAt: authResult.expiresAt
        }
      });
    } catch (error) {
      res.status(401).json({
        error: error.message,
        code: 'AUTHENTICATION_FAILED'
      });
    }
  }

  /**
   * Login with cryptographic signature
   */
  private async loginWithSignature(req: Request, res: Response) {
    try {
      const payload: CartridgeAuthPayload = req.body;

      // Validate required fields
      if (!payload.cartridgeId || !payload.walletAddress || !payload.signature || !payload.message) {
        return res.status(400).json({
          error: 'Missing required authentication fields',
          code: 'INVALID_INPUT'
        });
      }

      const authResult = await this.config.authService.authenticateWithSignature(payload);

      res.json({
        success: true,
        data: {
          player: authResult.player,
          sessionToken: authResult.sessionToken,
          refreshToken: authResult.refreshToken,
          expiresAt: authResult.expiresAt
        }
      });
    } catch (error) {
      res.status(401).json({
        error: error.message,
        code: 'AUTHENTICATION_FAILED'
      });
    }
  }

  /**
   * Refresh session token
   */
  private async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          error: 'Refresh token is required',
          code: 'INVALID_INPUT'
        });
      }

      const authResult = await this.config.authService.refreshToken(refreshToken);

      res.json({
        success: true,
        data: {
          player: authResult.player,
          sessionToken: authResult.sessionToken,
          refreshToken: authResult.refreshToken,
          expiresAt: authResult.expiresAt
        }
      });
    } catch (error) {
      res.status(401).json({
        error: error.message,
        code: 'TOKEN_REFRESH_FAILED'
      });
    }
  }

  /**
   * Logout current session
   */
  private async logout(req: Request, res: Response) {
    try {
      if (req.sessionToken) {
        await this.config.authService.logout(req.sessionToken);
      }

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: 'LOGOUT_FAILED'
      });
    }
  }

  /**
   * Logout all sessions for the user
   */
  private async logoutAll(req: Request, res: Response) {
    try {
      if (req.user) {
        await this.config.authService.revokeAllSessions(req.user.id);
      }

      res.json({
        success: true,
        message: 'All sessions revoked successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: 'LOGOUT_ALL_FAILED'
      });
    }
  }

  /**
   * Get current session info
   */
  private async getSession(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'No active session',
          code: 'NO_SESSION'
        });
      }

      res.json({
        success: true,
        data: {
          player: req.user,
          sessionActive: true
        }
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: 'SESSION_CHECK_FAILED'
      });
    }
  }

  /**
   * Get active sessions count
   */
  private async getSessions(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED'
        });
      }

      const activeSessionsCount = this.config.authService.getActiveSessionsCount(req.user.id);

      res.json({
        success: true,
        data: {
          activeSessionsCount
        }
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        code: 'SESSIONS_CHECK_FAILED'
      });
    }
  }

  /**
   * Health check endpoint
   */
  private async healthCheck(req: Request, res: Response) {
    res.json({
      success: true,
      service: 'auth',
      status: 'healthy',
      timestamp: Date.now()
    });
  }

  getRouter(): Router {
    return this.router;
  }
}