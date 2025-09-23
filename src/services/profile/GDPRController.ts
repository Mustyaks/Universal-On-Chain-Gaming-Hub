/**
 * GDPR Compliance Controller
 * Handles GDPR-related endpoints for data export, deletion, and privacy controls
 */

import { Request, Response } from 'express';
import { ProfileSecurityService, PrivacySettings, DataExportRequest, DataDeletionRequest } from './ProfileSecurityService';
import { AuthService } from '@/types/services';
import { Player, ApiResponse } from '@/types/core';

export class GDPRController {
    constructor(
        private securityService: ProfileSecurityService,
        private authService: AuthService
    ) { }

    /**
     * Get privacy settings
     * GET /api/gdpr/privacy-settings
     */
    async getPrivacySettings(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);
            const settings = await this.securityService.getPrivacySettings(player.id);

            res.json(this.successResponse(settings));
        } catch (error) {
            console.error('Error getting privacy settings:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to get privacy settings'));
        }
    }

    /**
     * Update privacy settings
     * PUT /api/gdpr/privacy-settings
     */
    async updatePrivacySettings(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);
            const settings: Partial<PrivacySettings> = req.body;

            await this.securityService.updatePrivacySettings(player.id, settings);

            res.json(this.successResponse({ message: 'Privacy settings updated successfully' }));
        } catch (error) {
            console.error('Error updating privacy settings:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to update privacy settings'));
        }
    }

    /**
     * Request data export
     * POST /api/gdpr/export-request
     */
    async requestDataExport(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);
            const requestId = await this.securityService.requestDataExport(player.id);

            res.status(202).json(this.successResponse({
                requestId,
                message: 'Data export request submitted. You will be notified when the export is ready.',
                estimatedTime: '24-48 hours'
            }));
        } catch (error) {
            console.error('Error requesting data export:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to request data export'));
        }
    }

    /**
     * Get data export status
     * GET /api/gdpr/export-request/:requestId
     */
    async getDataExportStatus(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);
            const { requestId } = req.params;

            if (!requestId) {
                res.status(400).json(this.errorResponse('Request ID is required'));
                return;
            }

            const request = await this.getExportRequest(requestId, player.id);

            res.json(this.successResponse({
                id: request.id,
                status: request.status,
                requestedAt: request.requestedAt,
                downloadUrl: request.downloadUrl,
                expiresAt: request.expiresAt,
                fileSize: request.fileSize
            }));
        } catch (error) {
            console.error('Error getting export status:', error);
            res.status(404).json(this.errorResponse(error instanceof Error ? error.message : 'Export request not found'));
        }
    }

    /**
     * Request data deletion
     * POST /api/gdpr/deletion-request
     */
    async requestDataDeletion(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);
            const { reason } = req.body;

            const requestId = await this.securityService.requestDataDeletion(player.id, reason);

            res.status(202).json(this.successResponse({
                requestId,
                message: 'Data deletion request submitted. Your data will be deleted in 30 days unless you cancel the request.',
                scheduledFor: Date.now() + (30 * 24 * 60 * 60 * 1000),
                gracePeriod: '30 days'
            }));
        } catch (error) {
            console.error('Error requesting data deletion:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to request data deletion'));
        }
    }

    /**
     * Cancel data deletion request
     * DELETE /api/gdpr/deletion-request/:requestId
     */
    async cancelDataDeletion(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);
            const { requestId } = req.params;

            if (!requestId) {
                res.status(400).json(this.errorResponse('Request ID is required'));
                return;
            }

            await this.securityService.cancelDataDeletion(requestId, player.id);

            res.json(this.successResponse({
                message: 'Data deletion request cancelled successfully'
            }));
        } catch (error) {
            console.error('Error cancelling data deletion:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to cancel data deletion'));
        }
    }

    /**
     * Get data deletion status
     * GET /api/gdpr/deletion-request/:requestId
     */
    async getDataDeletionStatus(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);
            const { requestId } = req.params;

            if (!requestId) {
                res.status(400).json(this.errorResponse('Request ID is required'));
                return;
            }

            const request = await this.getDeletionRequest(requestId, player.id);

            res.json(this.successResponse({
                id: request.id,
                status: request.status,
                requestedAt: request.requestedAt,
                scheduledFor: request.scheduledFor,
                reason: request.reason
            }));
        } catch (error) {
            console.error('Error getting deletion status:', error);
            res.status(404).json(this.errorResponse(error instanceof Error ? error.message : 'Deletion request not found'));
        }
    }

    /**
     * Get data processing information
     * GET /api/gdpr/data-processing-info
     */
    async getDataProcessingInfo(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);

            const info = {
                dataController: {
                    name: 'Universal Gaming Hub',
                    contact: 'privacy@universalgaminghub.com',
                    address: '123 Gaming Street, Tech City, TC 12345'
                },
                dataProcessingPurposes: [
                    'Providing gaming services and features',
                    'User authentication and account management',
                    'Cross-game asset and achievement tracking',
                    'Social features and friend connections',
                    'Analytics and service improvement (with consent)',
                    'Marketing communications (with consent)'
                ],
                legalBasis: [
                    'Contract performance (Art. 6(1)(b) GDPR)',
                    'Legitimate interests (Art. 6(1)(f) GDPR)',
                    'Consent (Art. 6(1)(a) GDPR) for marketing and analytics'
                ],
                dataRetention: {
                    profileData: '2 years after last activity',
                    gameData: '2 years after last activity',
                    analyticsData: '26 months (with consent)',
                    marketingData: 'Until consent withdrawn'
                },
                yourRights: [
                    'Right to access your personal data',
                    'Right to rectification of inaccurate data',
                    'Right to erasure ("right to be forgotten")',
                    'Right to restrict processing',
                    'Right to data portability',
                    'Right to object to processing',
                    'Right to withdraw consent'
                ],
                dataSharing: [
                    'Game developers (for cross-game features)',
                    'Service providers (hosting, analytics)',
                    'Legal authorities (when required by law)'
                ]
            };

            res.json(this.successResponse(info));
        } catch (error) {
            console.error('Error getting data processing info:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to get data processing info'));
        }
    }

    /**
     * Update consent preferences
     * PUT /api/gdpr/consent
     */
    async updateConsent(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);
            const { analyticsConsent, marketingConsent } = req.body;

            if (typeof analyticsConsent !== 'boolean' && typeof marketingConsent !== 'boolean') {
                res.status(400).json(this.errorResponse('At least one consent preference must be provided'));
                return;
            }

            const updates: Partial<PrivacySettings> = {};
            if (typeof analyticsConsent === 'boolean') {
                updates.analyticsConsent = analyticsConsent;
            }
            if (typeof marketingConsent === 'boolean') {
                updates.marketingConsent = marketingConsent;
            }

            await this.securityService.updatePrivacySettings(player.id, updates);

            res.json(this.successResponse({
                message: 'Consent preferences updated successfully',
                analyticsConsent: updates.analyticsConsent,
                marketingConsent: updates.marketingConsent
            }));
        } catch (error) {
            console.error('Error updating consent:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to update consent'));
        }
    }

    /**
     * Get data breach notifications (if any)
     * GET /api/gdpr/breach-notifications
     */
    async getBreachNotifications(req: Request, res: Response): Promise<void> {
        try {
            const player = await this.authenticateRequest(req);

            // In a real implementation, this would fetch actual breach notifications
            // For now, return empty array
            const notifications: any[] = [];

            res.json(this.successResponse({
                notifications,
                message: notifications.length === 0 ? 'No data breach notifications at this time' : undefined
            }));
        } catch (error) {
            console.error('Error getting breach notifications:', error);
            res.status(400).json(this.errorResponse(error instanceof Error ? error.message : 'Failed to get breach notifications'));
        }
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
     * Get export request with ownership validation
     */
    private async getExportRequest(requestId: string, playerId: string): Promise<DataExportRequest> {
        // This would typically be implemented in the security service
        // For now, we'll simulate the database call
        throw new Error('Method not implemented - would fetch from database');
    }

    /**
     * Get deletion request with ownership validation
     */
    private async getDeletionRequest(requestId: string, playerId: string): Promise<DataDeletionRequest> {
        // This would typically be implemented in the security service
        // For now, we'll simulate the database call
        throw new Error('Method not implemented - would fetch from database');
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