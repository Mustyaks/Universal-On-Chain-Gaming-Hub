/**
 * Social Controller
 * Handles HTTP requests for social features
 */

import { Request, Response } from 'express';
import { SocialService } from './SocialService';
import { ApiResponse } from '../../types/core';

interface AuthenticatedRequest extends Request {
  user: {
    playerId: string;
    // Add other user properties as needed
  };
}

export class SocialController {
  constructor(private socialService: SocialService) {}

  /**
   * Send friend request
   */
  async addFriend(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { playerId } = req.user; // From auth middleware
      const { friendId } = req.body;

      if (!friendId) {
        res.status(400).json({
          success: false,
          error: 'Friend ID is required',
          timestamp: Date.now()
        } as ApiResponse<null>);
        return;
      }

      await this.socialService.addFriend(playerId, friendId);

      res.status(200).json({
        success: true,
        data: { message: 'Friend request sent successfully' },
        timestamp: Date.now()
      } as ApiResponse<{ message: string }>);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send friend request',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Remove friend or decline friend request
   */
  async removeFriend(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { playerId } = req.user;
      const { friendId } = req.params;

      if (!friendId) {
        res.status(400).json({
          success: false,
          error: 'Friend ID is required',
          timestamp: Date.now()
        } as ApiResponse<null>);
        return;
      }

      await this.socialService.removeFriend(playerId, friendId);

      res.status(200).json({
        success: true,
        data: { message: 'Friend removed successfully' },
        timestamp: Date.now()
      } as ApiResponse<{ message: string }>);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove friend',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Get friends list
   */
  async getFriends(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { playerId } = req.user;
      const friends = await this.socialService.getFriends(playerId);

      res.status(200).json({
        success: true,
        data: friends,
        timestamp: Date.now()
      } as ApiResponse<typeof friends>);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get friends',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Get friend requests
   */
  async getFriendRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { playerId } = req.user;
      const requests = await this.socialService.getFriendRequests(playerId);

      res.status(200).json({
        success: true,
        data: requests,
        timestamp: Date.now()
      } as ApiResponse<typeof requests>);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get friend requests',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Search players
   */
  async searchPlayers(req: Request, res: Response): Promise<void> {
    try {
      const { q: query, limit } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Search query is required',
          timestamp: Date.now()
        } as ApiResponse<null>);
        return;
      }

      const searchLimit = limit ? parseInt(limit as string, 10) : 20;
      const players = await this.socialService.searchPlayers(query, searchLimit);

      res.status(200).json({
        success: true,
        data: players,
        timestamp: Date.now()
      } as ApiResponse<typeof players>);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search players',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Accept friend request
   */
  async acceptFriendRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { playerId } = req.user;
      const { requestId } = req.params;

      if (!requestId) {
        res.status(400).json({
          success: false,
          error: 'Request ID is required',
          timestamp: Date.now()
        } as ApiResponse<null>);
        return;
      }

      await this.socialService.acceptFriendRequest(requestId, playerId);

      res.status(200).json({
        success: true,
        data: { message: 'Friend request accepted' },
        timestamp: Date.now()
      } as ApiResponse<{ message: string }>);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to accept friend request',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Block player
   */
  async blockPlayer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { playerId } = req.user;
      const { targetPlayerId } = req.body;

      if (!targetPlayerId) {
        res.status(400).json({
          success: false,
          error: 'Target player ID is required',
          timestamp: Date.now()
        } as ApiResponse<null>);
        return;
      }

      await this.socialService.blockPlayer(playerId, targetPlayerId);

      res.status(200).json({
        success: true,
        data: { message: 'Player blocked successfully' },
        timestamp: Date.now()
      } as ApiResponse<{ message: string }>);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to block player',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Get social statistics
   */
  async getSocialStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { playerId } = req.user;
      const stats = await this.socialService.getSocialStats(playerId);

      res.status(200).json({
        success: true,
        data: stats,
        timestamp: Date.now()
      } as ApiResponse<typeof stats>);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get social stats',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Create community quest
   */
  async createCommunityQuest(req: Request, res: Response): Promise<void> {
    try {
      const questData = req.body;

      // Validate required fields
      if (!questData.title || !questData.description || !questData.requirements || !questData.rewards) {
        res.status(400).json({
          success: false,
          error: 'Missing required quest fields',
          timestamp: Date.now()
        } as ApiResponse<null>);
        return;
      }

      const questId = await this.socialService.createCommunityQuest(questData);

      res.status(201).json({
        success: true,
        data: { questId, message: 'Community quest created successfully' },
        timestamp: Date.now()
      } as ApiResponse<{ questId: string; message: string }>);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create community quest',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }

  /**
   * Join community quest
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

      await this.socialService.joinQuest(questId, playerId);

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
   * Get active quests
   */
  async getActiveQuests(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { playerId } = req.user;
      const { participating } = req.query;

      const playerIdFilter = participating === 'true' ? playerId : undefined;
      const quests = await this.socialService.getActiveQuests(playerIdFilter);

      res.status(200).json({
        success: true,
        data: quests,
        timestamp: Date.now()
      } as ApiResponse<typeof quests>);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get active quests',
        timestamp: Date.now()
      } as ApiResponse<null>);
    }
  }
}