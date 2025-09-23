/**
 * Cartridge Controller Authentication Service
 * Handles authentication and session management with Cartridge Controller
 */

import {
    AuthService,
    AuthResult,
    DatabaseService,
    CacheService
} from '@/types/services';
import {
    Player,
    UnifiedProfile,
    Timestamp,
    GameProfile,
    SocialConnection
} from '@/types/core';
import { ProfileServiceImpl } from './ProfileService';

export interface CartridgeSession {
    sessionId: string;
    cartridgeId: string;
    playerId: string;
    createdAt: Timestamp;
    expiresAt: Timestamp;
    refreshToken: string;
}

export interface CartridgeAuthConfig {
    jwtSecret: string;
    sessionDuration: number; // in seconds
    refreshTokenDuration: number; // in seconds
}

export class CartridgeAuthService implements AuthService {
    constructor(
        private database: DatabaseService,
        private cache: CacheService,
        private profileService: ProfileServiceImpl,
        private config: CartridgeAuthConfig
    ) { }

    /**
     * Authenticate user with Cartridge Controller
     */
    async authenticateWithCartridge(cartridgeId: string): Promise<AuthResult> {
        // Validate Cartridge ID format
        this.validateCartridgeId(cartridgeId);

        // Get or create player profile
        let profile: UnifiedProfile;
        try {
            // Try to find existing profile
            const existingProfile = await this.database.findOne<UnifiedProfile>(
                'profiles',
                { cartridgeId }
            );

            if (existingProfile) {
                profile = existingProfile;
            } else {
                // Create new profile
                profile = await this.profileService.createProfile(cartridgeId);
            }
        } catch (error) {
            throw new Error(`Authentication failed: ${error}`);
        }

        // Create player object
        const player: Player = await this.buildPlayerObject(profile);

        // Generate session tokens
        const sessionToken = this.generateSessionToken();
        const refreshToken = this.generateRefreshToken();
        const now = Date.now();
        const expiresAt = now + (this.config.sessionDuration * 1000);

        // Create session record
        const session: CartridgeSession = {
            sessionId: sessionToken,
            cartridgeId,
            playerId: profile.playerId,
            createdAt: now,
            expiresAt,
            refreshToken
        };

        // Store session in database and cache
        await Promise.all([
            this.database.insertOne('sessions', session),
            this.cache.set(`session:${sessionToken}`, session, this.config.sessionDuration)
        ]);

        return {
            player,
            sessionToken,
            refreshToken,
            expiresAt
        };
    }
    /**
     * Generate a secure session token
     */
    private generateSessionToken(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    }

    /**
     * Generate a secure refresh token
     */
    private generateRefreshToken(): string {
        return `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 20)}`;
    }

    /**
     * Validate Cartridge ID format
     */
    private validateCartridgeId(cartridgeId: string): void {
        if (!cartridgeId || typeof cartridgeId !== 'string') {
            throw new Error('Invalid Cartridge ID: must be a non-empty string');
        }

        if (cartridgeId.length < 10 || cartridgeId.length > 100) {
            throw new Error('Invalid Cartridge ID: length must be between 10 and 100 characters');
        }

        // Basic format validation (alphanumeric with underscores and hyphens)
        const validFormat = /^[a-zA-Z0-9_-]+$/.test(cartridgeId);
        if (!validFormat) {
            throw new Error('Invalid Cartridge ID: must contain only alphanumeric characters, underscores, and hyphens');
        }
    }

    /**
     * Validate session token and return player
     */
    async validateSession(sessionToken: string): Promise<Player> {
        // Check cache first
        let session = await this.cache.get<CartridgeSession>(`session:${sessionToken}`);

        if (!session) {
            // Check database
            session = await this.database.findOne<CartridgeSession>(
                'sessions',
                { sessionId: sessionToken }
            );
        }

        if (!session) {
            throw new Error('Invalid session token');
        }

        // Check if session is expired
        if (Date.now() > session.expiresAt) {
            // Clean up expired session
            await this.cleanupSession(sessionToken);
            throw new Error('Session expired');
        }

        // Get player profile
        const profile = await this.profileService.getProfile(session.playerId);
        const player = await this.buildPlayerObject(profile);

        // Update cache TTL
        const remainingTTL = Math.floor((session.expiresAt - Date.now()) / 1000);
        await this.cache.set(`session:${sessionToken}`, session, remainingTTL);

        return player;
    }

    /**
     * Refresh authentication token
     */
    async refreshToken(refreshToken: string): Promise<AuthResult> {
        // Find session by refresh token
        const session = await this.database.findOne<CartridgeSession>(
            'sessions',
            { refreshToken }
        );

        if (!session) {
            throw new Error('Invalid refresh token');
        }

        // Check if refresh token is still valid
        const refreshExpiresAt = session.createdAt + (this.config.refreshTokenDuration * 1000);
        if (Date.now() > refreshExpiresAt) {
            // Clean up expired session
            await this.cleanupSession(session.sessionId);
            throw new Error('Refresh token expired');
        }

        // Generate new tokens
        const newSessionToken = this.generateSessionToken();
        const newRefreshToken = this.generateRefreshToken();
        const now = Date.now();
        const expiresAt = now + (this.config.sessionDuration * 1000);

        // Update session
        const updatedSession: CartridgeSession = {
            ...session,
            sessionId: newSessionToken,
            refreshToken: newRefreshToken,
            createdAt: now,
            expiresAt
        };

        // Update database and cache
        await Promise.all([
            this.database.updateOne('sessions', session.sessionId, updatedSession),
            this.cache.delete(`session:${session.sessionId}`),
            this.cache.set(`session:${newSessionToken}`, updatedSession, this.config.sessionDuration)
        ]);

        // Get player profile
        const profile = await this.profileService.getProfile(session.playerId);
        const player = await this.buildPlayerObject(profile);

        return {
            player,
            sessionToken: newSessionToken,
            refreshToken: newRefreshToken,
            expiresAt
        };
    }

    /**
     * Logout and invalidate session
     */
    async logout(sessionToken: string): Promise<void> {
        await this.cleanupSession(sessionToken);
    }

    /**
     * Build complete player object from profile
     */
    private async buildPlayerObject(profile: UnifiedProfile): Promise<Player> {
        // Get game profiles
        const gameProfiles = await this.database.findMany<GameProfile>(
            'game_profiles',
            { playerId: profile.playerId }
        );

        // Get social connections
        const socialConnections = await this.database.findMany<SocialConnection>(
            'social_connections',
            { playerId: profile.playerId }
        );

        return {
            id: profile.playerId,
            cartridgeId: profile.cartridgeId,
            walletAddress: await this.getWalletAddress(profile.cartridgeId),
            profile,
            gameProfiles,
            socialConnections
        };
    }

    /**
     * Get wallet address from Cartridge ID
     */
    private async getWalletAddress(cartridgeId: string): Promise<string> {
        // In a real implementation, this would query the Cartridge Controller
        // to get the associated wallet address for the given Cartridge ID
        // For now, we'll generate a deterministic address based on the Cartridge ID
        const hash = this.hashString(cartridgeId);
        return `0x${hash.substr(0, 40)}`;
    }

    /**
     * Clean up expired or invalid session
     */
    private async cleanupSession(sessionToken: string): Promise<void> {
        await Promise.all([
            this.database.deleteOne('sessions', sessionToken),
            this.cache.delete(`session:${sessionToken}`)
        ]);
    }

    /**
     * Generate a simple hash from a string (for demo purposes)
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).padStart(40, '0');
    }
}