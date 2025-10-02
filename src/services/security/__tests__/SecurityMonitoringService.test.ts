import { SecurityMonitoringService } from '../SecurityMonitoringService';
import { Request } from 'express';

const mockRequest = (overrides: Partial<Request> = {}): Request => ({
  ip: '127.0.0.1',
  user: undefined,
  connection: { remoteAddress: '127.0.0.1' },
  path: '/test',
  method: 'GET',
  get: jest.fn().mockReturnValue('Mozilla/5.0'),
  ...overrides
} as any);

describe('SecurityMonitoringService', () => {
  let securityService: SecurityMonitoringService;

  beforeEach(() => {
    securityService = new SecurityMonitoringService();
  });

  describe('recordEvent', () => {
    it('should record security events', () => {
      const req = mockRequest();
      
      securityService.recordEvent('RATE_LIMIT_EXCEEDED', req, {
        endpoint: '/api/test'
      });

      const events = securityService.getRecentEvents(10);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('RATE_LIMIT_EXCEEDED');
      expect(events[0].ip).toBe('127.0.0.1');
      expect(events[0].details.endpoint).toBe('/api/test');
    });

    it('should include user information when available', () => {
      const req = mockRequest({
        user: { id: 'user123' } as any
      });
      
      securityService.recordEvent('INVALID_TOKEN_USAGE', req);

      const events = securityService.getRecentEvents(1);
      expect(events[0].userId).toBe('user123');
    });
  });

  describe('IP banning', () => {
    it('should ban and check IP addresses', () => {
      const ip = '192.168.1.100';
      
      expect(securityService.isIPBanned(ip)).toBe(false);
      
      securityService.banIP(ip);
      
      expect(securityService.isIPBanned(ip)).toBe(true);
    });

    it('should automatically unban IP after duration', (done) => {
      const ip = '192.168.1.101';
      
      securityService.banIP(ip, 50); // 50ms duration
      
      expect(securityService.isIPBanned(ip)).toBe(true);
      
      setTimeout(() => {
        expect(securityService.isIPBanned(ip)).toBe(false);
        done();
      }, 100);
    });
  });

  describe('User suspicion', () => {
    it('should mark and check suspicious users', () => {
      const userId = 'user123';
      
      expect(securityService.isUserSuspicious(userId)).toBe(false);
      
      securityService.markUserSuspicious(userId);
      
      expect(securityService.isUserSuspicious(userId)).toBe(true);
    });

    it('should automatically clear suspicion after duration', (done) => {
      const userId = 'user456';
      
      securityService.markUserSuspicious(userId, 50); // 50ms duration
      
      expect(securityService.isUserSuspicious(userId)).toBe(true);
      
      setTimeout(() => {
        expect(securityService.isUserSuspicious(userId)).toBe(false);
        done();
      }, 100);
    });
  });

  describe('Security rules and alerts', () => {
    it('should trigger alert for multiple failed logins', () => {
      const req = mockRequest({ ip: '192.168.1.200' });
      
      // Simulate 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        securityService.recordEvent('MULTIPLE_FAILED_LOGINS', req);
      }

      const alerts = securityService.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].rule.type).toBe('MULTIPLE_FAILED_LOGINS');
      expect(alerts[0].rule.action).toBe('TEMPORARY_BAN');
      
      // IP should be banned
      expect(securityService.isIPBanned('192.168.1.200')).toBe(true);
    });

    it('should trigger alert for rate limit exceeded', () => {
      const req = mockRequest({ ip: '192.168.1.201' });
      
      // Simulate 10 rate limit exceeded events
      for (let i = 0; i < 10; i++) {
        securityService.recordEvent('RATE_LIMIT_EXCEEDED', req);
      }

      const alerts = securityService.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].rule.type).toBe('RATE_LIMIT_EXCEEDED');
      expect(alerts[0].rule.severity).toBe('MEDIUM');
    });

    it('should trigger alert for suspicious transactions', () => {
      const req = mockRequest({ 
        ip: '192.168.1.202',
        user: { id: 'user789' } as any
      });
      
      // Simulate 3 suspicious transaction events
      for (let i = 0; i < 3; i++) {
        securityService.recordEvent('SUSPICIOUS_TRANSACTION', req);
      }

      const alerts = securityService.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].rule.type).toBe('SUSPICIOUS_TRANSACTION');
      expect(alerts[0].rule.severity).toBe('CRITICAL');
      expect(alerts[0].rule.action).toBe('MANUAL_REVIEW');
    });
  });

  describe('Alert management', () => {
    it('should resolve alerts', () => {
      const req = mockRequest();
      
      // Trigger an alert
      for (let i = 0; i < 5; i++) {
        securityService.recordEvent('MULTIPLE_FAILED_LOGINS', req);
      }

      let alerts = securityService.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      
      const alertId = alerts[0].id;
      securityService.resolveAlert(alertId, 'False positive');
      
      alerts = securityService.getActiveAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('Event retrieval', () => {
    it('should return recent events in chronological order', () => {
      const req = mockRequest();
      
      securityService.recordEvent('RATE_LIMIT_EXCEEDED', req);
      
      // Wait a bit to ensure different timestamps
      setTimeout(() => {
        securityService.recordEvent('INVALID_TOKEN_USAGE', req);
        
        const events = securityService.getRecentEvents(10);
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe('INVALID_TOKEN_USAGE'); // Most recent first
        expect(events[1].type).toBe('RATE_LIMIT_EXCEEDED');
      }, 1);
    });

    it('should limit number of returned events', () => {
      const req = mockRequest();
      
      // Record 5 events
      for (let i = 0; i < 5; i++) {
        securityService.recordEvent('RATE_LIMIT_EXCEEDED', req);
      }

      const events = securityService.getRecentEvents(3);
      expect(events).toHaveLength(3);
    });
  });
});