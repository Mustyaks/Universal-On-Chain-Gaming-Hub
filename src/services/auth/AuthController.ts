import { CartridgeAuthService, CartridgeControllerConfig } from './CartridgeAuthService';
import { AuthMiddleware } from './AuthMiddleware';
import { AuthRoutes } from './AuthRoutes';
import { ProfileService } from '../../types/services';

export interface AuthControllerConfig {
  cartridgeConfig: CartridgeControllerConfig;
  profileService: ProfileService;
  skipAuthPaths?: string[];
}

export class AuthController {
  private authService: CartridgeAuthService;
  private authMiddleware: AuthMiddleware;
  private authRoutes: AuthRoutes;

  constructor(private config: AuthControllerConfig) {
    this.setupServices();
  }

  private setupServices() {
    // Initialize auth service
    this.authService = new CartridgeAuthService(
      this.config.cartridgeConfig,
      this.config.profileService
    );

    // Initialize middleware
    this.authMiddleware = new AuthMiddleware({
      authService: this.authService,
      skipPaths: this.config.skipAuthPaths || [
        '/auth/login',
        '/auth/refresh',
        '/auth/health',
        '/health',
        '/graphql' // GraphQL handles its own auth
      ],
      requireAuth: false
    });

    // Initialize routes
    this.authRoutes = new AuthRoutes({
      authService: this.authService,
      authMiddleware: this.authMiddleware
    });

    // Start cleanup interval for expired sessions
    this.startSessionCleanup();
  }

  private startSessionCleanup() {
    // Clean up expired sessions every 15 minutes
    setInterval(async () => {
      try {
        await this.authService.cleanupExpiredSessions();
      } catch (error) {
        console.error('Session cleanup failed:', error);
      }
    }, 15 * 60 * 1000);
  }

  /**
   * Get authentication service instance
   */
  getAuthService(): CartridgeAuthService {
    return this.authService;
  }

  /**
   * Get authentication middleware instance
   */
  getAuthMiddleware(): AuthMiddleware {
    return this.authMiddleware;
  }

  /**
   * Get authentication routes
   */
  getAuthRoutes(): AuthRoutes {
    return this.authRoutes;
  }

  /**
   * Initialize authentication for Express app
   */
  initializeAuth(app: any) {
    // Apply global authentication middleware
    app.use(this.authMiddleware.authenticate());

    // Mount auth routes
    app.use('/auth', this.authRoutes.getRouter());

    console.log('Authentication initialized');
  }

  /**
   * Shutdown cleanup
   */
  async shutdown() {
    // Perform any cleanup operations
    console.log('Auth controller shutting down');
  }
}