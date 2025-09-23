/**
 * Social Service Implementation
 * Handles friend connections, player search, and social interactions
 */

import {
  SocialService as ISocialService,
  FriendRequest,
  DatabaseService,
  CacheService,
  NotificationService,
  EventService
} from '../../types/services';
import {
  UnifiedProfile,
  SocialConnection,
  CommunityQuest
} from '../../types/core';

export class SocialService implements ISocialService {
  constructor(
    private db: DatabaseService,
    private cache: CacheService,
    private notifications: NotificationService,
    private events: EventService
  ) {}

  /**
   * Send a friend request to another player
   */
  async addFriend(playerId: string, friendId: string): Promise<void> {
    if (playerId === friendId) {
      throw new Error('Cannot add yourself as a friend');
    }

    // Check if friend exists
    const friendProfile = await this.db.findOne<UnifiedProfile>('profiles', { playerId: friendId });
    if (!friendProfile) {
      throw new Error('Player not found');
    }

    // Check friend's privacy settings
    if (!friendProfile.socialSettings.allowFriendRequests) {
      throw new Error('This player is not accepting friend requests');
    }

    // Check if connection already exists
    const existingConnection = await this.db.findOne<SocialConnection>('social_connections', {
      $or: [
        { playerId, friendId },
        { playerId: friendId, friendId: playerId }
      ]
    });

    if (existingConnection) {
      if (existingConnection.status === 'ACCEPTED') {
        throw new Error('Already friends with this player');
      }
      if (existingConnection.status === 'PENDING') {
        throw new Error('Friend request already pending');
      }
      if (existingConnection.status === 'BLOCKED') {
        throw new Error('Cannot send friend request to blocked player');
      }
    }

    // Create friend request
    const friendRequest: SocialConnection = {
      id: `fr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId,
      friendId,
      status: 'PENDING',
      createdAt: Date.now()
    };

    await this.db.insertOne('social_connections', friendRequest);

    // Send notification to the friend
    await this.notifications.sendNotification(friendId, {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId: friendId,
      type: 'FRIEND_REQUEST',
      title: 'New Friend Request',
      message: `${(await this.db.findOne<UnifiedProfile>('profiles', { playerId }))?.displayName || 'Someone'} wants to be your friend`,
      data: { fromPlayerId: playerId, requestId: friendRequest.id },
      read: false,
      createdAt: Date.now()
    });

    // Emit event for real-time updates
    this.events.emit('friend_request_sent', { playerId, friendId, requestId: friendRequest.id });

    // Invalidate cache
    await this.cache.delete(`friends:${playerId}`);
    await this.cache.delete(`friend_requests:${friendId}`);
  }

  /**
   * Remove a friend or decline/cancel a friend request
   */
  async removeFriend(playerId: string, friendId: string): Promise<void> {
    const connection = await this.db.findOne<SocialConnection>('social_connections', {
      $or: [
        { playerId, friendId },
        { playerId: friendId, friendId: playerId }
      ]
    });

    if (!connection) {
      throw new Error('No connection found with this player');
    }

    await this.db.deleteOne('social_connections', connection.id);

    // Emit event for real-time updates
    this.events.emit('friend_removed', { playerId, friendId });

    // Invalidate cache
    await this.cache.delete(`friends:${playerId}`);
    await this.cache.delete(`friends:${friendId}`);
    await this.cache.delete(`friend_requests:${playerId}`);
    await this.cache.delete(`friend_requests:${friendId}`);
  }

  /**
   * Get list of friends for a player
   */
  async getFriends(playerId: string): Promise<UnifiedProfile[]> {
    // Check cache first
    const cacheKey = `friends:${playerId}`;
    const cached = await this.cache.get<UnifiedProfile[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get accepted friend connections
    const connections = await this.db.findMany<SocialConnection>('social_connections', {
      $or: [
        { playerId, status: 'ACCEPTED' },
        { friendId: playerId, status: 'ACCEPTED' }
      ]
    });

    // Get friend IDs
    const friendIds = connections.map(conn => 
      conn.playerId === playerId ? conn.friendId : conn.playerId
    );

    if (friendIds.length === 0) {
      return [];
    }

    // Get friend profiles
    const friends = await this.db.findMany<UnifiedProfile>('profiles', {
      playerId: { $in: friendIds }
    });

    // Filter based on privacy settings
    const visibleFriends = friends.filter(friend => 
      friend.socialSettings.profileVisibility !== 'PRIVATE'
    );

    // Cache for 5 minutes
    await this.cache.set(cacheKey, visibleFriends, 300);

    return visibleFriends;
  }

  /**
   * Get pending friend requests for a player
   */
  async getFriendRequests(playerId: string): Promise<FriendRequest[]> {
    // Check cache first
    const cacheKey = `friend_requests:${playerId}`;
    const cached = await this.cache.get<FriendRequest[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get pending requests where this player is the recipient
    const connections = await this.db.findMany<SocialConnection>('social_connections', {
      friendId: playerId,
      status: 'PENDING'
    });

    // Convert to FriendRequest format
    const requests: FriendRequest[] = connections.map((conn): FriendRequest => ({
      id: conn.id,
      fromPlayerId: conn.playerId,
      toPlayerId: conn.friendId,
      createdAt: conn.createdAt,
      status: 'PENDING'
    }));

    // Cache for 2 minutes
    await this.cache.set(cacheKey, requests, 120);

    return requests;
  }

  /**
   * Search for players by display name or other criteria
   */
  async searchPlayers(query: string, limit: number = 20): Promise<UnifiedProfile[]> {
    if (!query || query.trim().length < 2) {
      throw new Error('Search query must be at least 2 characters');
    }

    const searchQuery = query.trim().toLowerCase();
    
    // Search by display name (case-insensitive)
    const profiles = await this.db.findMany<UnifiedProfile>('profiles', {
      $and: [
        {
          $or: [
            { displayName: { $regex: searchQuery, $options: 'i' } },
            { cartridgeId: { $regex: searchQuery, $options: 'i' } }
          ]
        },
        {
          'socialSettings.profileVisibility': { $in: ['PUBLIC', 'FRIENDS_ONLY'] }
        }
      ]
    }, { limit, sort: { displayName: 1 } });

    return profiles;
  }

  /**
   * Create a new community quest
   */
  async createCommunityQuest(quest: Omit<CommunityQuest, 'id' | 'participants'>): Promise<string> {
    const questId = `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const communityQuest: CommunityQuest = {
      ...quest,
      id: questId,
      participants: []
    };

    await this.db.insertOne('community_quests', communityQuest);

    // Emit event for real-time updates
    this.events.emit('quest_created', { questId, quest: communityQuest });

    // Invalidate active quests cache
    await this.cache.invalidatePattern('active_quests:*');

    return questId;
  }

  /**
   * Join a community quest
   */
  async joinQuest(questId: string, playerId: string): Promise<void> {
    const quest = await this.db.findOne<CommunityQuest>('community_quests', { id: questId });
    
    if (!quest) {
      throw new Error('Quest not found');
    }

    if (quest.status !== 'ACTIVE') {
      throw new Error('Quest is not active');
    }

    if (quest.participants.includes(playerId)) {
      throw new Error('Already participating in this quest');
    }

    // Check if quest has ended
    if (quest.endDate < Date.now()) {
      throw new Error('Quest has expired');
    }

    // Add player to participants
    await this.db.updateOne('community_quests', questId, {
      $push: { participants: playerId }
    });

    // Send notification
    await this.notifications.sendNotification(playerId, {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId,
      type: 'QUEST',
      title: 'Quest Joined',
      message: `You've joined the quest: ${quest.title}`,
      data: { questId },
      read: false,
      createdAt: Date.now()
    });

    // Emit event
    this.events.emit('quest_joined', { questId, playerId });

    // Invalidate cache
    await this.cache.invalidatePattern('active_quests:*');
  }

  /**
   * Get active community quests, optionally filtered by player participation
   */
  async getActiveQuests(playerId?: string): Promise<CommunityQuest[]> {
    const cacheKey = playerId ? `active_quests:${playerId}` : 'active_quests:all';
    const cached = await this.cache.get<CommunityQuest[]>(cacheKey);
    if (cached) {
      return cached;
    }

    let query: any = {
      status: 'ACTIVE',
      endDate: { $gt: Date.now() }
    };

    if (playerId) {
      query.participants = { $in: [playerId] };
    }

    const quests = await this.db.findMany<CommunityQuest>('community_quests', query, {
      sort: { startDate: -1 },
      limit: 50
    });

    // Cache for 2 minutes
    await this.cache.set(cacheKey, quests, 120);

    return quests;
  }

  /**
   * Accept a friend request
   */
  async acceptFriendRequest(requestId: string, playerId: string): Promise<void> {
    const connection = await this.db.findOne<SocialConnection>('social_connections', {
      id: requestId,
      friendId: playerId,
      status: 'PENDING'
    });

    if (!connection) {
      throw new Error('Friend request not found');
    }

    // Update status to accepted
    await this.db.updateOne('social_connections', requestId, {
      status: 'ACCEPTED'
    });

    // Send notification to requester
    await this.notifications.sendNotification(connection.playerId, {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId: connection.playerId,
      type: 'FRIEND_REQUEST',
      title: 'Friend Request Accepted',
      message: `${(await this.db.findOne<UnifiedProfile>('profiles', { playerId }))?.displayName || 'Someone'} accepted your friend request`,
      data: { friendId: playerId },
      read: false,
      createdAt: Date.now()
    });

    // Emit event
    this.events.emit('friend_request_accepted', { 
      requestId, 
      playerId, 
      friendId: connection.playerId 
    });

    // Invalidate cache
    await this.cache.delete(`friends:${playerId}`);
    await this.cache.delete(`friends:${connection.playerId}`);
    await this.cache.delete(`friend_requests:${playerId}`);
  }

  /**
   * Block a player
   */
  async blockPlayer(playerId: string, targetPlayerId: string): Promise<void> {
    if (playerId === targetPlayerId) {
      throw new Error('Cannot block yourself');
    }

    // Remove existing connection if any
    const existingConnection = await this.db.findOne<SocialConnection>('social_connections', {
      $or: [
        { playerId, friendId: targetPlayerId },
        { playerId: targetPlayerId, friendId: playerId }
      ]
    });

    if (existingConnection) {
      await this.db.deleteOne('social_connections', existingConnection.id);
    }

    // Create blocked connection
    const blockedConnection: SocialConnection = {
      id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId,
      friendId: targetPlayerId,
      status: 'BLOCKED',
      createdAt: Date.now()
    };

    await this.db.insertOne('social_connections', blockedConnection);

    // Emit event
    this.events.emit('player_blocked', { playerId, targetPlayerId });

    // Invalidate cache
    await this.cache.delete(`friends:${playerId}`);
    await this.cache.delete(`friends:${targetPlayerId}`);
  }

  /**
   * Get social interaction statistics for a player
   */
  async getSocialStats(playerId: string): Promise<{
    friendCount: number;
    pendingRequests: number;
    questsParticipated: number;
    questsCompleted: number;
  }> {
    const cacheKey = `social_stats:${playerId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const [friendConnections, pendingRequests, participatedQuests, completedQuests] = await Promise.all([
      this.db.findMany<SocialConnection>('social_connections', {
        $or: [
          { playerId, status: 'ACCEPTED' },
          { friendId: playerId, status: 'ACCEPTED' }
        ]
      }),
      this.db.findMany<SocialConnection>('social_connections', {
        friendId: playerId,
        status: 'PENDING'
      }),
      this.db.findMany<CommunityQuest>('community_quests', {
        participants: { $in: [playerId] }
      }),
      this.db.findMany<CommunityQuest>('community_quests', {
        participants: { $in: [playerId] },
        status: 'COMPLETED'
      })
    ]);

    const stats = {
      friendCount: friendConnections.length,
      pendingRequests: pendingRequests.length,
      questsParticipated: participatedQuests.length,
      questsCompleted: completedQuests.length
    };

    // Cache for 5 minutes
    await this.cache.set(cacheKey, stats, 300);

    return stats;
  }
}