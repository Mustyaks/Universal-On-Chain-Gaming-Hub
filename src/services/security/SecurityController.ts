import { RateLimitService, RedisRateLimitStore, MemoryRateLimitStore } from './RateLimitService';
import { SecurityMonitoringService } from './SecurityMonitoringService';
import { SecurityMiddleware, SecurityMiddlewareConfig } from './SecurityMiddleware';
import { ValidationService } from './ValidationService';

export interface SecurityControllerConfig {
  redisClient?: any;
  corsOrigins?: string[];
  trustProxy?: boolean;
  enableHelmet?: boolean;
  enableCORS?: boolean;
}

export class SecurityController {
  private rateLimitService!: RateLimitService;
  private securityMonitoring!: SecurityMonitoringService;
  private securityMiddleware!: SecurityMiddleware;

  constructor(private config: SecurityControllerConfig = {}) {
    this.setupServices();
  }

  private setupServices() {
    // Setup rate limiting store
    const rateLimitStore = this.config.redisClient
      ? new RedisRateLimitStore(this.config.redisClient)
      : new MemoryRateLimitStore();

    this.rateLimitService = new RateLimitService(rateLimitStore);
    this.securityMonitoring = new SecurityMonitoringService();

    // Build config object with only defined values to satisfy exactOptionalPropertyTypes
    const middlewareConfig: SecurityMiddlewareConfig = {
      rateLimitService: this.rateLimitService,
      securityMonitoring: this.securityMonitoring
    };

    if (this.config.enableHelmet !== undefined) {
      middlewareConfig.enableHelmet = this.config.enableHelmet;
    }
    if (this.config.enableCORS !== undefined) {
      middlewareConfig.enableCORS = this.config.enableCORS;
    }
    if (this.config.corsOrigins !== undefined) {
      middlewareConfig.corsOrigins = this.config.corsOrigins;
    }
    if (this.config.trustProxy !== undefined) {
      middlewareConfig.trustProxy = this.config.trustProxy;
    }

    this.securityMiddleware = new SecurityMiddleware(middlewareConfig);
  }

  /**
   * Initialize security for Express app
   */
  initializeSecurity(app: any): void {
    // Store security monitoring in app locals for access in other middleware
    app.locals.securityMonitoring = this.securityMonitoring;

    // Apply all security middleware
    this.securityMiddleware.applySecurityMiddleware(app);

    // Add security routes
    this.addSecurityRoutes(app);

    console.log('Security controller initialized');
  }

  /**
   * Add security management routes
   */
  private addSecurityRoutes(app: any): void {
    // Security monitoring endpoints (admin only)
    app.get('/admin/security/events', (req: any, res: any) => {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const limit = parseInt(req.query.limit) || 100;
      const events = this.securityMonitoring.getRecentEvents(limit);

      res.json({
        success: true,
        data: events
      });
    });

    app.get('/admin/security/alerts', (req: any, res: any) => {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const alerts = this.securityMonitoring.getActiveAlerts();

      res.json({
        success: true,
        data: alerts
      });
    });

    app.post('/admin/security/alerts/:alertId/resolve', (req: any, res: any) => {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { alertId } = req.params;
      const { notes } = req.body;

      this.securityMonitoring.resolveAlert(alertId, notes);

      res.json({
        success: true,
        message: 'Alert resolved'
      });
    });

    app.post('/admin/security/ban-ip', (req: any, res: any) => {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { ip, duration } = req.body;

      if (!ip) {
        return res.status(400).json({ error: 'IP address is required' });
      }

      this.securityMonitoring.banIP(ip, duration);

      res.json({
        success: true,
        message: 'IP banned successfully'
      });
    });

    app.post('/admin/security/reset-rate-limit', (req: any, res: any) => {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { key } = req.body;

      if (!key) {
        return res.status(400).json({ error: 'Rate limit key is required' });
      }

      this.rateLimitService.resetLimit(key);

      res.json({
        success: true,
        message: 'Rate limit reset successfully'
      });
    });
  }

  /**
   * Get rate limiting service
   */
  getRateLimitService(): RateLimitService {
    return this.rateLimitService;
  }

  /**
   * Get security monitoring service
   */
  getSecurityMonitoring(): SecurityMonitoringService {
    return this.securityMonitoring;
  }

  /**
   * Get security middleware
   */
  getSecurityMiddleware(): SecurityMiddleware {
    return this.securityMiddleware;
  }

  /**
   * Create validation middleware for common schemas
   */
  createValidationMiddleware(schemaName: keyof typeof ValidationService.schemas) {
    return this.securityMiddleware.createValidationMiddleware(schemaName);
  }

  /**
   * Create custom rate limiting middleware
   */
  createRateLimitMiddleware(windowMs: number, maxRequests: number, message?: string) {
    return this.securityMiddleware.createRateLimitMiddleware(windowMs, maxRequests, message);
  }

  /**
   * Get middleware for sensitive operations
   */
  getSensitiveOperationMiddleware() {
    return this.securityMiddleware.sensitiveOperationMiddleware();
  }

  /**
   * Shutdown cleanup
   */
  async shutdown(): Promise<void> {
    console.log('Security controller shutting down');
    // Perform any cleanup operations
  }
}