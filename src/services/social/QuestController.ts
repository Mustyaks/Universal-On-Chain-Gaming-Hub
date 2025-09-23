/**
 * Quest Controller
 * Handles HTTP requests for quest management
 */

import { Request, Response } from 'express';
import { QuestService, QuestCreationData } from './QuestService';
import { ApiResponse } from '../../types/core';

interface AuthenticatedRequest extends Request {
    user: {
        playerId: string;
        // Add other user properties as needed
    };
}

export class QuestController {
    constructor(private questService: QuestService) { }

    /**
     * Create a new community quest
     */
    async createQuest(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { playerId } = req.user; // From auth middleware
            const questData: QuestCreationData = {
                ...req.body,
                createdBy: playerId
            };

            const questId = await this.questService.createQuest(questData);

            res.status(201).json({
                success: true,
                data: { questId, message: 'Quest created successfully' },
                timestamp: Date.now()
            } as ApiResponse<{ questId: string; message: string }>);
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create quest',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }

    /**
     * Join a quest
     */
    async joinQuest(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { playerId } = req.user;
            const { questId } = req.params;

            if (!questId) {
                res.status(400).json({
                    success: false,
                    error: 'Quest ID is required',
                    timestamp: Date.now()
                } as ApiResponse<null>);
                return;
            }

            await this.questService.joinQuest(questId, playerId);

            res.status(200).json({
                success: true,
                data: { message: 'Successfully joined quest' },
                timestamp: Date.now()
            } as ApiResponse<{ message: string }>);
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to join quest',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }

    /**
     * Get active quests with filtering
     */
    async getActiveQuests(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { playerId } = req.user;
            const { category, difficulty, participating } = req.query;

            // Build filters object conditionally to avoid undefined values
            const filters: {
                category?: string;
                difficulty?: string;
                playerId?: string;
                participating?: boolean;
            } = {};

            if (category && typeof category === 'string') {
                filters.category = category;
            }
            if (difficulty && typeof difficulty === 'string') {
                filters.difficulty = difficulty;
            }
            if (participating === 'true') {
                filters.playerId = playerId;
                filters.participating = true;
            }

            const quests = await this.questService.getActiveQuests(filters);

            res.status(200).json({
                success: true,
                data: quests,
                timestamp: Date.now()
            } as ApiResponse<typeof quests>);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get quests',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }

    /**
     * Get player's quest participation
     */
    async getPlayerParticipation(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { playerId } = req.user;
            const participation = await this.questService.getPlayerQuestParticipation(playerId);

            res.status(200).json({
                success: true,
                data: participation,
                timestamp: Date.now()
            } as ApiResponse<typeof participation>);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get participation',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }

    /**
     * Update quest progress
     */
    async updateProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { playerId } = req.user;
            const { questId } = req.params;
            const { requirementIndex, value } = req.body;

            if (!questId) {
                res.status(400).json({
                    success: false,
                    error: 'Quest ID is required',
                    timestamp: Date.now()
                } as ApiResponse<null>);
                return;
            }

            if (typeof requirementIndex !== 'number' || typeof value !== 'number') {
                res.status(400).json({
                    success: false,
                    error: 'Requirement index and value must be numbers',
                    timestamp: Date.now()
                } as ApiResponse<null>);
                return;
            }

            await this.questService.updateQuestProgress(playerId, questId, requirementIndex, value);

            res.status(200).json({
                success: true,
                data: { message: 'Progress updated successfully' },
                timestamp: Date.now()
            } as ApiResponse<{ message: string }>);
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to update progress',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }

    /**
     * Get quest statistics
     */
    async getQuestStats(_req: Request, res: Response): Promise<void> {
        try {
            const stats = await this.questService.getQuestStats();

            res.status(200).json({
                success: true,
                data: stats,
                timestamp: Date.now()
            } as ApiResponse<typeof stats>);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get quest statistics',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }

    /**
     * Complete a quest (admin only)
     */
    async completeQuest(req: Request, res: Response): Promise<void> {
        try {
            const { questId } = req.params;

            if (!questId) {
                res.status(400).json({
                    success: false,
                    error: 'Quest ID is required',
                    timestamp: Date.now()
                } as ApiResponse<null>);
                return;
            }

            // In a real implementation, check if user is admin
            await this.questService.completeQuest(questId);

            res.status(200).json({
                success: true,
                data: { message: 'Quest completed successfully' },
                timestamp: Date.now()
            } as ApiResponse<{ message: string }>);
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to complete quest',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }

    /**
     * Get quest leaderboard
     */
    async getQuestLeaderboard(req: Request, res: Response): Promise<void> {
        try {
            const { questId } = req.params;
            const { limit: _limit = '10' } = req.query;

            if (!questId) {
                res.status(400).json({
                    success: false,
                    error: 'Quest ID is required',
                    timestamp: Date.now()
                } as ApiResponse<null>);
                return;
            }

            // This would be implemented in QuestService
            // For now, return a placeholder response
            const leaderboard: unknown[] = []; // await this.questService.getQuestLeaderboard(questId, parseInt(_limit as string));

            res.status(200).json({
                success: true,
                data: leaderboard,
                timestamp: Date.now()
            } as ApiResponse<typeof leaderboard>);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get leaderboard',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }

    /**
     * Get quest discovery feed
     */
    async getQuestDiscovery(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { playerId: _playerId } = req.user;
            const { page = '1', limit = '20' } = req.query;

            // Get recommended quests based on player activity
            const quests = await this.questService.getActiveQuests({
                // Could add recommendation logic here using _playerId
            });

            // Simple pagination
            const pageNum = parseInt(page as string);
            const limitNum = parseInt(limit as string);
            const startIndex = (pageNum - 1) * limitNum;
            const paginatedQuests = quests.slice(startIndex, startIndex + limitNum);

            res.status(200).json({
                success: true,
                data: {
                    quests: paginatedQuests,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total: quests.length,
                        hasNext: startIndex + limitNum < quests.length
                    }
                },
                timestamp: Date.now()
            } as ApiResponse<{
                quests: typeof paginatedQuests;
                pagination: {
                    page: number;
                    limit: number;
                    total: number;
                    hasNext: boolean;
                };
            }>);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get quest discovery',
                timestamp: Date.now()
            } as ApiResponse<null>);
        }
    }
}