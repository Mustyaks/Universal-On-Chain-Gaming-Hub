import { AuthService, AuthResult } from '../../types/services';
import { Player } from '../../types/core';
import { ProfileService } from '../../types/services';

export interface CartridgeControllerConfig {
  rpcUrl: string;
  chainId: string;
  sessionDuration: number; // in milliseconds
  refreshTokenDuration: number; // in milliseconds
}

export interface CartridgeSession {
  sessionToken: string;
  refreshToken: string;
  playerId: string;
  cartridgeId: string;
  expiresAt: number;
  createdAt: number;
}

export interface CartridgeSignature {
  r: string;
  s: string;
  recovery_id: number;
}

export interface CartridgeAuthPayload {
  cartridgeId: string;
  walletAddress: string;
  signature: CartridgeSignature;
  message: string;
  timestamp: number;
}

export class CartridgeAuthService implements AuthService {
  private sessions = new Map<string, CartridgeSession>();
  private refreshTokens = new Map<string, string>(); // refreshToken -> sessionToken

  constructor(
    private config: CartridgeControllerConfig,
    private profileService: ProfileService
  ) {}

  async authenticateWithCartridge(cartridgeId: string): Promise<AuthResult> {
    // In a real implementation, this would verify the Cartridge Controller signature
    // For now, we'll create a mock authentication flow
    
    try {
      // Check if user profile exists, create if not
      let profile;
      try {
        profile = await this.profileService.getProfile(cartridgeId);
      } catch (error) {
        // Profile doesn't exist, create new one
        profile = await this.profileService.createProfile(cartridgeId);
      }

      // Generate session tokens
      const sessionToken = this.generateSessionToken();
      const refreshToken = this.generateRefreshToken();
      const expiresAt = Date.now() + this.config.sessionDuration;

      // Create session
      const session: CartridgeSession = {
        sessionToken,
        refreshToken,
        playerId: profile.playerId,
        cartridgeId,
        expiresAt,
        createdAt: Date.now()
      };

      // Store session
      this.sessions.set(sessionToken, session);
      this.refreshTokens.set(refreshToken, sessionToken);

      // Create player object
      const player: Player = {
        id: profile.playerId,
        cartridgeId,
        walletAddress: '', // Would be extracted from Cartridge Controller
        profile,
        gameProfiles: [],
        socialConnections: []
      };

      return {
        player,
        sessionToken,
        refreshToken,
        expiresAt
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async authenticateWithSignature(payload: CartridgeAuthPayload): Promise<AuthResult> {
    // Verify the signature and message
    if (!this.verifySignature(payload)) {
      throw new Error('Invalid signature');
    }

    // Check timestamp to prevent replay attacks
    const now = Date.now();
    if (Math.abs(now - payload.timestamp) > 300000) { // 5 minutes
      throw new Error('Authentication request expired');
    }

    // Proceed with authentication
    return this.authenticateWithCartridge(payload.cartridgeId);
  }

  async validateSession(sessionToken: string): Promise<Player> {
    const session = this.sessions.get(sessionToken);
    
    if (!session) {
      throw new Error('Invalid session token');
    }

    if (Date.now() > session.expiresAt) {
      // Session expired, clean up
      this.sessions.delete(sessionToken);
      this.refreshTokens.delete(session.refreshToken);
      throw new Error('Session expired');
    }

    // Get current profile
    const profile = await this.profileService.getProfile(session.playerId);
    if (!profile) {
      throw new Error('User profile not found');
    }

    return {
      id: session.playerId,
      cartridgeId: session.cartridgeId,
      walletAddress: '', // Would be stored in session or fetched from Cartridge
      profile,
      gameProfiles: [],
      socialConnections: []
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const sessionToken = this.refreshTokens.get(refreshToken);
    
    if (!sessionToken) {
      throw new Error('Invalid refresh token');
    }

    const session = this.sessions.get(sessionToken);
    if (!session) {
      throw new Error('Session not found');
    }

    // Check if refresh token is still valid (longer duration than session)
    const refreshExpiry = session.createdAt + this.config.refreshTokenDuration;
    if (Date.now() > refreshExpiry) {
      // Refresh token expired, clean up
      this.sessions.delete(sessionToken);
      this.refreshTokens.delete(refreshToken);
      throw new Error('Refresh token expired');
    }

    // Generate new session token
    const newSessionToken = this.generateSessionToken();
    const newExpiresAt = Date.now() + this.config.sessionDuration;

    // Update session
    const newSession: CartridgeSession = {
      ...session,
      sessionToken: newSessionToken,
      expiresAt: newExpiresAt
    };

    // Update storage
    this.sessions.delete(sessionToken);
    this.sessions.set(newSessionToken, newSession);
    this.refreshTokens.set(refreshToken, newSessionToken);

    // Get current profile
    const profile = await this.profileService.getProfile(session.playerId);
    
    const player: Player = {
      id: session.playerId,
      cartridgeId: session.cartridgeId,
      walletAddress: '',
      profile,
      gameProfiles: [],
      socialConnections: []
    };

    return {
      player,
      sessionToken: newSessionToken,
      refreshToken,
      expiresAt: newExpiresAt
    };
  }

  async logout(sessionToken: string): Promise<void> {
    const session = this.sessions.get(sessionToken);
    
    if (session) {
      this.sessions.delete(sessionToken);
      this.refreshTokens.delete(session.refreshToken);
    }
  }

  async revokeAllSessions(playerId: string): Promise<void> {
    // Find and remove all sessions for this player
    const sessionsToRemove: string[] = [];
    const refreshTokensToRemove: string[] = [];

    for (const [token, session] of this.sessions.entries()) {
      if (session.playerId === playerId) {
        sessionsToRemove.push(token);
        refreshTokensToRemove.push(session.refreshToken);
      }
    }

    sessionsToRemove.forEach(token => this.sessions.delete(token));
    refreshTokensToRemove.forEach(token => this.refreshTokens.delete(token));
  }

  private verifySignature(payload: CartridgeAuthPayload): boolean {
    // In a real implementation, this would:
    // 1. Reconstruct the message that was signed
    // 2. Verify the signature using Starknet cryptography
    // 3. Ensure the signature matches the cartridgeId/walletAddress
    
    // For now, return true for mock implementation
    return true;
  }

  private generateSessionToken(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private generateRefreshToken(): string {
    return `refresh_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  // Session management utilities
  getActiveSessionsCount(playerId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.playerId === playerId && Date.now() < session.expiresAt) {
        count++;
      }
    }
    return count;
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];
    const expiredRefreshTokens: string[] = [];

    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        expiredSessions.push(token);
        expiredRefreshTokens.push(session.refreshToken);
      }
    }

    expiredSessions.forEach(token => this.sessions.delete(token));
    expiredRefreshTokens.forEach(token => this.refreshTokens.delete(token));

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }
}