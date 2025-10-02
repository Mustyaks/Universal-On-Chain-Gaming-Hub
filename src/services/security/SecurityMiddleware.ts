import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { RateLimitService } from './RateLimitService';
import { ValidationService } from './ValidationService';
import { SecurityMonitoringService } from './SecurityMonitoringService';

export interface SecurityMiddlewareConfig {
  rateLimitService: RateLimitService;
  securityMonitoring: SecurityMonitoringService;
  enableHelmet?: boolean;
  enableCORS?: boolean;
  corsOrigins?: string[];
  trustProxy?: boolean;
}

export class SecurityMiddleware {
  constructor(private config: SecurityMiddlewareConfig) {}

  /**
   * Apply all security middleware to Express app
   */
  applySecurityMiddleware(app: any): void {
    // Trust proxy if behind reverse proxy
    if (this.config.trustProxy) {
      app.set('trust proxy', true);
    }

    // Apply Helmet for basic security headers
    if (this.config.enableHelmet !== false) {
      app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      }));
    }

    // Apply CORS if enabled
    if (this.config.enableCORS !== false) {
      app.use(this.corsMiddleware());
    }

    // Apply IP ban checking
    app.use(this.ipBanMiddleware());

    // Apply request logging and monitoring
    app.use(this.requestMonitoringMiddleware());

    // Apply rate limiting
    const rateLimitConfigs = RateLimitService.createConfigs();
    
    // Apply different rate limits to different routes
    app.use('/auth', this.config.rateLimitService.createMiddleware(rateLimitConfigs.auth));
    app.use('/api', this.config.rateLimitService.createMiddleware(rateLimitConfigs.api));
    app.use('/graphql', this.config.rateLimitService.createMiddleware(rateLimitConfigs.graphql));

    console.log('Security middleware applied');
  }

  /**
   * CORS middleware
   */
  private corsMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.get('Origin');
      const allowedOrigins = this.config.corsOrigins || ['http://localhost:3000'];

      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      }

      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }

      next();
    };
  }

  /**
   * IP ban checking middleware
   */
  private ipBanMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || req.connection.remoteAddress;
      
      if (ip && this.config.securityMonitoring.isIPBanned(ip)) {
        this.config.securityMonitoring.recordEvent('SUSPICIOUS_IP', req, {
          reason: 'Banned IP attempted access'
        });

        return res.status(403).json({
          error: 'Access denied',
          code: 'IP_BANNED'
        });
      }

      next();
    };
  }

  /**
   * Request monitoring middleware
   */
  private requestMonitoringMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Log request
      console.log(`${req.method} ${req.path} - ${req.ip} - ${req.get('User-Agent')}`);

      // Monitor for suspicious patterns
      this.detectSuspiciousActivity(req);

      // Override res.json to monitor responses
      const originalJson = res.json;
      res.json = function(body: any) {
        const responseTime = Date.now() - startTime;
        
        // Log response
        console.log(`${req.method} ${req.path} - ${res.statusCode} - ${responseTime}ms`);

        // Record security events based on response
        if (res.statusCode === 401) {
          req.app.locals.securityMonitoring?.recordEvent('INVALID_TOKEN_USAGE', req);
        } else if (res.statusCode === 429) {
          req.app.locals.securityMonitoring?.recordEvent('RATE_LIMIT_EXCEEDED', req);
        }

        return originalJson.call(this, body);
      };

      next();
    };
  }

  /**
   * Detect suspicious activity patterns
   */
  private detectSuspiciousActivity(req: Request): void {
    // Check for suspicious user agents
    const userAgent = req.get('User-Agent') || '';
    const suspiciousAgents = ['bot', 'crawler', 'spider', 'scraper'];
    
    if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
      this.config.securityMonitoring.recordEvent('UNUSUAL_ACTIVITY_PATTERN', req, {
        reason: 'Suspicious user agent',
        userAgent
      });
    }

    // Check for suspicious request patterns
    if (req.path.includes('..') || req.path.includes('<script>')) {
      this.config.securityMonitoring.recordEvent('UNUSUAL_ACTIVITY_PATTERN', req, {
        reason: 'Path traversal or XSS attempt',
        path: req.path
      });
    }

    // Check for unusual request sizes
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    if (contentLength > 10 * 1024 * 1024) { // 10MB
      this.config.securityMonitoring.recordEvent('UNUSUAL_ACTIVITY_PATTERN', req, {
        reason: 'Unusually large request',
        contentLength
      });
    }

    // Check for rapid requests from same IP
    if (req.user) {
      const userId = req.user.id;
      if (this.config.securityMonitoring.isUserSuspicious(userId)) {
        this.config.securityMonitoring.recordEvent('ACCOUNT_TAKEOVER_ATTEMPT', req, {
          reason: 'Request from suspicious user'
        });
      }
    }
  }

  /**
   * Create validation middleware for specific schemas
   */
  createValidationMiddleware(schemaName: keyof typeof ValidationService.schemas) {
    const schema = ValidationService.schemas[schemaName];
    return ValidationService.validate(schema);
  }

  /**
   * Create custom rate limiting middleware
   */
  createRateLimitMiddleware(windowMs: number, maxRequests: number, message?: string) {
    return this.config.rateLimitService.createMiddleware({
      windowMs,
      maxRequests,
      message: message || 'Rate limit exceeded'
    });
  }

  /**
   * Middleware for sensitive operations
   */
  sensitiveOperationMiddleware() {
    const rateLimitConfigs = RateLimitService.createConfigs();
    
    return [
      this.config.rateLimitService.createMiddleware(rateLimitConfigs.sensitive),
      (req: Request, res: Response, next: NextFunction) => {
        // Additional checks for sensitive operations
        if (req.user && this.config.securityMonitoring.isUserSuspicious(req.user.id)) {
          return res.status(403).json({
            error: 'Account under review',
            code: 'ACCOUNT_SUSPENDED'
          });
        }

        this.config.securityMonitoring.recordEvent('SUSPICIOUS_TRANSACTION', req, {
          operation: req.path,
          userId: req.user?.id
        });

        next();
      }
    ];
  }

  /**
   * Get security monitoring service
   */
  getSecurityMonitoring(): SecurityMonitoringService {
    return this.config.securityMonitoring;
  }
}