import { CartridgeAuthService, CartridgeControllerConfig } from '../CartridgeAuthService';
import { ProfileService } from '../../../types/services';
import { UnifiedProfile } from '../../../types/core';

// Mock ProfileService
const mockProfileService: jest.Mocked<ProfileService> = {
  createProfile: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  aggregateGameData: jest.fn(),
  searchProfiles: jest.fn(),
};

const mockConfig: CartridgeControllerConfig = {
  rpcUrl: 'http://localhost:5050',
  chainId: 'SN_GOERLI',
  sessionDuration: 3600000, // 1 hour
  refreshTokenDuration: 86400000, // 24 hours
};

const mockProfile: UnifiedProfile = {
  playerId: 'player-123',
  cartridgeId: 'cartridge-123',
  displayName: 'Test Player',
  avatar: 'https://example.com/avatar.png',
  totalAchievements: 0,
  crossGameAssets: [],
  socialSettings: {
    profileVisibility: 'PUBLIC',
    showAchievements: true,
    showAssets: true,
    allowFriendRequests: true,
  },
  createdAt: Date.now(),
};

describe('CartridgeAuthService', () => {
  let authService: CartridgeAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new CartridgeAuthService(mockConfig, mockProfileService);
  });

  describe('authenticateWithCartridge', () => {
    it('should authenticate existing user successfully', async () => {
      mockProfileService.getProfile.mockResolvedValue(mockProfile);

      const result = await authService.authenticateWithCartridge('cartridge-123');

      expect(result).toHaveProperty('player');
      expect(result).toHaveProperty('sessionToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresAt');
      expect(result.player.cartridgeId).toBe('cartridge-123');
      expect(mockProfileService.getProfile).toHaveBeenCalledWith('cartridge-123');
    });

    it('should create new user profile if not exists', async () => {
      mockProfileService.getProfile.mockRejectedValue(new Error('Profile not found'));
      mockProfileService.createProfile.mockResolvedValue(mockProfile);

      const result = await authService.authenticateWithCartridge('cartridge-new');

      expect(result).toHaveProperty('player');
      expect(mockProfileService.createProfile).toHaveBeenCalledWith('cartridge-new');
    });

    it('should handle authentication errors', async () => {
      mockProfileService.getProfile.mockRejectedValue(new Error('Database error'));
      mockProfileService.createProfile.mockRejectedValue(new Error('Database error'));

      await expect(
        authService.authenticateWithCartridge('cartridge-error')
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('validateSession', () => {
    it('should validate active session successfully', async () => {
      mockProfileService.getProfile.mockResolvedValue(mockProfile);

      // First authenticate to create a session
      const authResult = await authService.authenticateWithCartridge('cartridge-123');
      
      // Then validate the session
      const player = await authService.validateSession(authResult.sessionToken);

      expect(player.id).toBe(mockProfile.playerId);
      expect(player.cartridgeId).toBe('cartridge-123');
    });

    it('should reject invalid session token', async () => {
      await expect(
        authService.validateSession('invalid-token')
      ).rejects.toThrow('Invalid session token');
    });

    it('should reject expired session', async () => {
      // Create auth service with very short session duration
      const shortConfig = { ...mockConfig, sessionDuration: 1 }; // 1ms
      const shortAuthService = new CartridgeAuthService(shortConfig, mockProfileService);
      
      mockProfileService.getProfile.mockResolvedValue(mockProfile);
      
      const authResult = await shortAuthService.authenticateWithCartridge('cartridge-123');
      
      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await expect(
        shortAuthService.validateSession(authResult.sessionToken)
      ).rejects.toThrow('Session expired');
    });
  });

  describe('refreshToken', () => {
    it('should refresh valid token successfully', async () => {
      mockProfileService.getProfile.mockResolvedValue(mockProfile);

      const authResult = await authService.authenticateWithCartridge('cartridge-123');
      const refreshResult = await authService.refreshToken(authResult.refreshToken);

      expect(refreshResult).toHaveProperty('sessionToken');
      expect(refreshResult.sessionToken).not.toBe(authResult.sessionToken);
      expect(refreshResult.refreshToken).toBe(authResult.refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      await expect(
        authService.refreshToken('invalid-refresh-token')
      ).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('logout', () => {
    it('should logout session successfully', async () => {
      mockProfileService.getProfile.mockResolvedValue(mockProfile);

      const authResult = await authService.authenticateWithCartridge('cartridge-123');
      
      await authService.logout(authResult.sessionToken);
      
      await expect(
        authService.validateSession(authResult.sessionToken)
      ).rejects.toThrow('Invalid session token');
    });

    it('should handle logout of non-existent session gracefully', async () => {
      await expect(
        authService.logout('non-existent-token')
      ).resolves.not.toThrow();
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all sessions for a player', async () => {
      mockProfileService.getProfile.mockResolvedValue(mockProfile);

      // Create multiple sessions
      const auth1 = await authService.authenticateWithCartridge('cartridge-123');
      const auth2 = await authService.authenticateWithCartridge('cartridge-123');

      // Revoke all sessions
      await authService.revokeAllSessions(mockProfile.playerId);

      // Both sessions should be invalid
      await expect(
        authService.validateSession(auth1.sessionToken)
      ).rejects.toThrow('Invalid session token');

      await expect(
        authService.validateSession(auth2.sessionToken)
      ).rejects.toThrow('Invalid session token');
    });
  });

  describe('getActiveSessionsCount', () => {
    it('should return correct active sessions count', async () => {
      mockProfileService.getProfile.mockResolvedValue(mockProfile);

      expect(authService.getActiveSessionsCount(mockProfile.playerId)).toBe(0);

      await authService.authenticateWithCartridge('cartridge-123');
      expect(authService.getActiveSessionsCount(mockProfile.playerId)).toBe(1);

      await authService.authenticateWithCartridge('cartridge-123');
      expect(authService.getActiveSessionsCount(mockProfile.playerId)).toBe(2);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should clean up expired sessions', async () => {
      // Create auth service with very short session duration
      const shortConfig = { ...mockConfig, sessionDuration: 1 }; // 1ms
      const shortAuthService = new CartridgeAuthService(shortConfig, mockProfileService);
      
      mockProfileService.getProfile.mockResolvedValue(mockProfile);
      
      const authResult = await shortAuthService.authenticateWithCartridge('cartridge-123');
      
      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await shortAuthService.cleanupExpiredSessions();
      
      await expect(
        shortAuthService.validateSession(authResult.sessionToken)
      ).rejects.toThrow('Invalid session token');
    });
  });
});