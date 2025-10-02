import { Request } from 'express';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  userId?: string;
  ip: string;
  userAgent?: string;
  endpoint: string;
  method: string;
  timestamp: number;
  details: Record<string, any>;
}

export type SecurityEventType = 
  | 'MULTIPLE_FAILED_LOGINS'
  | 'SUSPICIOUS_IP'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_TOKEN_USAGE'
  | 'UNUSUAL_ACTIVITY_PATTERN'
  | 'POTENTIAL_BRUTE_FORCE'
  | 'SUSPICIOUS_TRANSACTION'
  | 'ACCOUNT_TAKEOVER_ATTEMPT'
  | 'DATA_EXFILTRATION_ATTEMPT';

export interface SecurityRule {
  type: SecurityEventType;
  condition: (events: SecurityEvent[]) => boolean;
  timeWindowMs: number;
  threshold: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  action: SecurityAction;
}

export type SecurityAction = 
  | 'LOG_ONLY'
  | 'ALERT'
  | 'RATE_LIMIT'
  | 'TEMPORARY_BAN'
  | 'PERMANENT_BAN'
  | 'REQUIRE_2FA'
  | 'MANUAL_REVIEW';

export interface SecurityAlert {
  id: string;
  rule: SecurityRule;
  events: SecurityEvent[];
  triggeredAt: number;
  resolved: boolean;
  resolvedAt?: number;
  notes?: string;
}

export class SecurityMonitoringService {
  private events: SecurityEvent[] = [];
  private alerts: SecurityAlert[] = [];
  private rules: SecurityRule[] = [];
  private bannedIPs = new Set<string>();
  private suspiciousUsers = new Set<string>();

  constructor() {
    this.setupDefaultRules();
    this.startCleanupInterval();
  }

  /**
   * Record a security event
   */
  recordEvent(type: SecurityEventType, req: Request, details: Record<string, any> = {}): void {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type,
      severity: this.getEventSeverity(type),
      userId: req.user?.id,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method,
      timestamp: Date.now(),
      details
    };

    this.events.push(event);
    this.evaluateRules(event);
  }

  /**
   * Check if IP is banned
   */
  isIPBanned(ip: string): boolean {
    return this.bannedIPs.has(ip);
  }

  /**
   * Check if user is suspicious
   */
  isUserSuspicious(userId: string): boolean {
    return this.suspiciousUsers.has(userId);
  }

  /**
   * Ban an IP address
   */
  banIP(ip: string, duration?: number): void {
    this.bannedIPs.add(ip);
    
    if (duration) {
      setTimeout(() => {
        this.bannedIPs.delete(ip);
      }, duration);
    }
  }

  /**
   * Mark user as suspicious
   */
  markUserSuspicious(userId: string, duration?: number): void {
    this.suspiciousUsers.add(userId);
    
    if (duration) {
      setTimeout(() => {
        this.suspiciousUsers.delete(userId);
      }, duration);
    }
  }

  /**
   * Get recent security events
   */
  getRecentEvents(limit: number = 100): SecurityEvent[] {
    return this.events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): SecurityAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, notes?: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      alert.notes = notes;
    }
  }

  /**
   * Setup default security rules
   */
  private setupDefaultRules(): void {
    this.rules = [
      // Multiple failed logins from same IP
      {
        type: 'MULTIPLE_FAILED_LOGINS',
        condition: (events) => {
          const failedLogins = events.filter(e => 
            e.type === 'MULTIPLE_FAILED_LOGINS' && 
            Date.now() - e.timestamp < 15 * 60 * 1000 // 15 minutes
          );
          return failedLogins.length >= 5;
        },
        timeWindowMs: 15 * 60 * 1000,
        threshold: 5,
        severity: 'HIGH',
        action: 'TEMPORARY_BAN'
      },

      // Rate limit exceeded multiple times
      {
        type: 'RATE_LIMIT_EXCEEDED',
        condition: (events) => {
          const rateLimitEvents = events.filter(e => 
            e.type === 'RATE_LIMIT_EXCEEDED' && 
            Date.now() - e.timestamp < 5 * 60 * 1000 // 5 minutes
          );
          return rateLimitEvents.length >= 10;
        },
        timeWindowMs: 5 * 60 * 1000,
        threshold: 10,
        severity: 'MEDIUM',
        action: 'RATE_LIMIT'
      },

      // Suspicious transaction patterns
      {
        type: 'SUSPICIOUS_TRANSACTION',
        condition: (events) => {
          const transactionEvents = events.filter(e => 
            e.type === 'SUSPICIOUS_TRANSACTION' && 
            Date.now() - e.timestamp < 60 * 60 * 1000 // 1 hour
          );
          return transactionEvents.length >= 3;
        },
        timeWindowMs: 60 * 60 * 1000,
        threshold: 3,
        severity: 'CRITICAL',
        action: 'MANUAL_REVIEW'
      },

      // Invalid token usage
      {
        type: 'INVALID_TOKEN_USAGE',
        condition: (events) => {
          const tokenEvents = events.filter(e => 
            e.type === 'INVALID_TOKEN_USAGE' && 
            Date.now() - e.timestamp < 10 * 60 * 1000 // 10 minutes
          );
          return tokenEvents.length >= 20;
        },
        timeWindowMs: 10 * 60 * 1000,
        threshold: 20,
        severity: 'HIGH',
        action: 'TEMPORARY_BAN'
      }
    ];
  }

  /**
   * Evaluate security rules against new event
   */
  private evaluateRules(newEvent: SecurityEvent): void {
    for (const rule of this.rules) {
      if (rule.type === newEvent.type) {
        const relevantEvents = this.getEventsForRule(rule, newEvent);
        
        if (rule.condition(relevantEvents)) {
          this.triggerAlert(rule, relevantEvents);
        }
      }
    }
  }

  /**
   * Get events relevant to a security rule
   */
  private getEventsForRule(rule: SecurityRule, newEvent: SecurityEvent): SecurityEvent[] {
    const cutoffTime = Date.now() - rule.timeWindowMs;
    
    return this.events.filter(event => 
      event.type === rule.type &&
      event.timestamp >= cutoffTime &&
      (event.ip === newEvent.ip || event.userId === newEvent.userId)
    );
  }

  /**
   * Trigger a security alert
   */
  private triggerAlert(rule: SecurityRule, events: SecurityEvent[]): void {
    const alert: SecurityAlert = {
      id: this.generateAlertId(),
      rule,
      events,
      triggeredAt: Date.now(),
      resolved: false
    };

    this.alerts.push(alert);
    this.executeSecurityAction(rule, events);
    
    console.warn(`Security alert triggered: ${rule.type}`, {
      alertId: alert.id,
      severity: rule.severity,
      action: rule.action,
      eventCount: events.length
    });
  }

  /**
   * Execute security action
   */
  private executeSecurityAction(rule: SecurityRule, events: SecurityEvent[]): void {
    const latestEvent = events[events.length - 1];
    
    switch (rule.action) {
      case 'TEMPORARY_BAN':
        if (latestEvent.ip) {
          this.banIP(latestEvent.ip, 60 * 60 * 1000); // 1 hour ban
        }
        if (latestEvent.userId) {
          this.markUserSuspicious(latestEvent.userId, 60 * 60 * 1000);
        }
        break;
        
      case 'RATE_LIMIT':
        // This would integrate with the rate limiting service
        break;
        
      case 'MANUAL_REVIEW':
        // This would notify administrators
        break;
        
      case 'ALERT':
        // This would send notifications
        break;
        
      default:
        // LOG_ONLY - already logged above
        break;
    }
  }

  /**
   * Get event severity based on type
   */
  private getEventSeverity(type: SecurityEventType): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const severityMap: Record<SecurityEventType, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
      'MULTIPLE_FAILED_LOGINS': 'MEDIUM',
      'SUSPICIOUS_IP': 'MEDIUM',
      'RATE_LIMIT_EXCEEDED': 'LOW',
      'INVALID_TOKEN_USAGE': 'MEDIUM',
      'UNUSUAL_ACTIVITY_PATTERN': 'MEDIUM',
      'POTENTIAL_BRUTE_FORCE': 'HIGH',
      'SUSPICIOUS_TRANSACTION': 'CRITICAL',
      'ACCOUNT_TAKEOVER_ATTEMPT': 'CRITICAL',
      'DATA_EXFILTRATION_ATTEMPT': 'CRITICAL'
    };

    return severityMap[type] || 'LOW';
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Start cleanup interval for old events
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupOldEvents();
    }, 60 * 60 * 1000); // Cleanup every hour
  }

  /**
   * Clean up old events and alerts
   */
  private cleanupOldEvents(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Remove old events
    this.events = this.events.filter(event => event.timestamp > cutoffTime);
    
    // Remove old resolved alerts
    this.alerts = this.alerts.filter(alert => 
      !alert.resolved || (alert.resolvedAt && alert.resolvedAt > cutoffTime)
    );
  }
}