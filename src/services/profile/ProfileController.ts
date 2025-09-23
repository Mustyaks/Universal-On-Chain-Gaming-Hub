/**
 * Profile API Controller
 * Handles HTTP endpoints for profile management
 */

import { Request, Response } from 'express';
import {
    ProfileService,
    AuthService
} from '@/types/services';
import {
    UnifiedProfile,
    Player,
    ApiResponse,
    SocialSettings
} from '@/types/core';
import { ProfileAggregationService, ProfileStatistics } from './ProfileAggregationService';

export class ProfileController {
    constructor(
        private profileService: ProfileService,
        private authService: AuthService,
        private aggregationService: ProfileAggregationService
    ) { }

    /**
     * Create a new profile
     * POST /api/profiles
     */
    async createProfile(req: Request, res: Response): Promise<void> {
        try {
            const { cartridgeId } = req.body;

            if (!cartridgeId) {
                res.status(400).json(this.errorResponse('Cartridge ID is required'));
                return;
            }

            const profile = await this.profileService.createProfile(cartridgeId);

            res.status(201).json(this.successResponse(profile));
        } catch (error) {
            console.error('Error creating profile:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to create profile'));
        }
    }

    /**
     * Get profile by player ID
     * GET /api/profiles/:playerId
     */
    async getProfile(req: Request, res: Response): Promise<void> {
        try {
            const { playerId } = req.params;

            if (!playerId) {
                res.status(400).json(this.errorResponse('Player ID is required'));
                return;
            }

            const profile = await this.profileService.getProfile(playerId);

            res.json(this.successResponse(profile));
        } catch (error) {
            console.error('Error getting profile:', error);
            res.status(404).json(this.errorResponse(error instanceof Error ? error.message : 'Profile not found'));
        }
    }

    /**
     * Update profile
     * PUT /api/profiles/:playerId
     */
    async updateProfile(req: Request, res: Response): Promise<void> {
        try {
            const { playerId } = req.params;
            const updates = req.body;

            if (!playerId) {
                res.status(400).json(this.errorResponse('Player ID is required'));
                return;
            }

            // Authenticate the request
            const player = await this.authenticateRequest(req);

            // Check if the player can update this profile
            if (player.id !== playerId) {
                res.status(403).json(this.errorResponse('Unauthorized to update this profile'));
                return;
            }

            await this.profileService.updateProfile(playerId, updates);

            res.json(this.successResponse({ message: 'Profile updated successfully' }));
        } catch (error) {
            console.error('Error updating profile:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to update profile'));
        }
    }

    /**
     * Get aggregated profile data
     * GET /api/profiles/:playerId/aggregated
     */
    async getAggregatedData(req: Request, res: Response): Promise<void> {
        try {
            const { playerId } = req.params;

            if (!playerId) {
                res.status(400).json(this.errorResponse('Player ID is required'));
                return;
            }

            const aggregatedData = await this.profileService.aggregateGameData(playerId);

            res.json(this.successResponse(aggregatedData));
        } catch (error) {
            console.error('Error getting aggregated data:', error);
            res.status(404).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to get aggregated data'));
        }
    }

    /**
     * Get profile statistics
     * GET /api/profiles/:playerId/statistics
     */
    async getProfileStatistics(req: Request, res: Response): Promise<void> {
        try {
            const { playerId } = req.params;

            if (!playerId) {
                res.status(400).json(this.errorResponse('Player ID is required'));
                return;
            }

            const statistics = await this.aggregationService.getProfileStatistics(playerId);

            res.json(this.successResponse(statistics));
        } catch (error) {
            console.error('Error getting profile statistics:', error);
            res.status(404).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to get profile statistics'));
        }
    }

    /**
     * Search profiles
     * GET /api/profiles/search?q=query&limit=20
     */
    async searchProfiles(req: Request, res: Response): Promise<void> {
        try {
            const { q: query, limit } = req.query;

            if (!query || typeof query !== 'string') {
                res.status(400).json(this.errorResponse('Search query is required'));
                return;
            }

            const limitNum = limit ? parseInt(limit as string, 10) : 20;
            const profiles = await this.profileService.searchProfiles(query, limitNum);

            res.json(this.successResponse(profiles));
        } catch (error) {
            console.error('Error searching profiles:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Search failed'));
        }
    }

    /**
     * Update social settings
     * PUT /api/profiles/:playerId/social-settings
     */
    async updateSocialSettings(req: Request, res: Response): Promise<void> {
        try {
            const { playerId } = req.params;
            const socialSettings: SocialSettings = req.body;

            if (!playerId) {
                res.status(400).json(this.errorResponse('Player ID is required'));
                return;
            }

            // Authenticate the request
            const player = await this.authenticateRequest(req);

            // Check if the player can update this profile
            if (player.id !== playerId) {
                res.status(403).json(this.errorResponse('Unauthorized to update this profile'));
                return;
            }

            // Validate social settings
            this.validateSocialSettings(socialSettings);

            await this.profileService.updateProfile(playerId, { socialSettings });

            res.json(this.successResponse({ message: 'Social settings updated successfully' }));
        } catch (error) {
            console.error('Error updating social settings:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to update social settings'));
        }
    }

    /**
     * Get cross-game assets
     * GET /api/profiles/:playerId/cross-game-assets
     */
    async getCrossGameAssets(req: Request, res: Response): Promise<void> {
        try {
            const { playerId } = req.params;

            if (!playerId) {
                res.status(400).json(this.errorResponse('Player ID is required'));
                return;
            }

            const crossGameAssets = await this.aggregationService.aggregateCrossGameData(playerId);

            res.json(this.successResponse(crossGameAssets));
        } catch (error) {
            console.error('Error getting cross-game assets:', error);
            res.status(404).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to get cross-game assets'));
        }
    }

    /**
     * Subscribe to real-time profile updates (WebSocket endpoint)
     * This would be used with Socket.IO or similar WebSocket library
     */
    subscribeToUpdates(playerId: string, callback: (data: any) => void): void {
        this.aggregationService.subscribeToProfileUpdates(playerId, callback);
    }

    /**
     * Unsubscribe from real-time profile updates
     */
    unsubscribeFromUpdates(playerId: string, callback: (data: any) => void): void {
        this.aggregationService.unsubscribeFromProfileUpdates(playerId, callback);
    }

    /**
     * Authenticate request and return player
     */
    private async authenticateRequest(req: Request): Promise<Player> {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new Error('Authorization header required');
        }

        const token = authHeader.substring(7);
        return await this.authService.validateSession(token);
    }

    /**
     * Validate social settings
     */
    private validateSocialSettings(settings: SocialSettings): void {
        const validVisibilities = ['PUBLIC', 'FRIENDS_ONLY', 'PRIVATE'];

        if (!validVisibilities.includes(settings.profileVisibility)) {
            throw new Error('Invalid profile visibility setting');
        }

        if (typeof settings.showAchievements !== 'boolean') {
            throw new Error('showAchievements must be a boolean');
        }

        if (typeof settings.showAssets !== 'boolean') {
            throw new Error('showAssets must be a boolean');
        }

        if (typeof settings.allowFriendRequests !== 'boolean') {
            throw new Error('allowFriendRequests must be a boolean');
        }
    }

    /**
     * Create success response
     */
    private successResponse<T>(data: T): ApiResponse<T> {
        return {
            success: true,
            data,
            timestamp: Date.now()
        };
    }

    /**
     * Create error response
     */
    private errorResponse(error: string): ApiResponse<null> {
        return {
            success: false,
            error,
            timestamp: Date.now()
        };
    }
}