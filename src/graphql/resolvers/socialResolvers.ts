import { GraphQLError } from 'graphql';
import { Context } from '../context';
import { SocialConnection } from '../../types/core';
import { withCache, withErrorHandling } from '../utils/resolverUtils';

export const socialResolvers = {
  Query: {
    friends: withErrorHandling(async (
      _: any,
      { playerId }: { playerId: string },
      context: Context
    ) => {
      // Check privacy settings
      if (context.user?.id !== playerId) {
        const profile = await context.services.profileService.getProfile(playerId);
        if (profile?.socialSettings.profileVisibility === 'PRIVATE') {
          throw new GraphQLError('Profile is private', {
            extensions: { code: 'FORBIDDEN' }
          });
        }
      }

      return withCache(
        `friends:${playerId}`,
        () => context.services.socialService.getFriends(playerId),
        300
      );
    }),

    friendRequests: withErrorHandling(async (
      _: any,
      { playerId }: { playerId: string },
      context: Context
    ) => {
      if (!context.user || context.user.id !== playerId) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      return withCache(
        `friendRequests:${playerId}`,
        () => context.services.socialService.getFriendRequests(playerId),
        60 // 1 minute cache for friend requests
      );
    }),
  },

  Mutation: {
    sendFriendRequest: withErrorHandling(async (
      _: any,
      { friendId, message }: { friendId: string; message?: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      if (context.user.id === friendId) {
        throw new GraphQLError('Cannot send friend request to yourself', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      // Check if target user allows friend requests
      const targetProfile = await context.services.profileService.getProfile(friendId);
      if (!targetProfile) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      if (!targetProfile.socialSettings.allowFriendRequests) {
        throw new GraphQLError('User does not accept friend requests', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      // Check if already friends or request exists
      const existingFriends = await context.services.socialService.getFriends(context.user.id);
      if (existingFriends.some(friend => friend.playerId === friendId)) {
        throw new GraphQLError('Already friends with this user', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      await context.services.socialService.addFriend(context.user.id, friendId);

      // Invalidate caches
      await context.cache.delete(`friends:${context.user.id}`);
      await context.cache.delete(`friendRequests:${friendId}`);

      // Publish subscription event
      context.pubsub.publish(`FRIEND_REQUEST_RECEIVED:${friendId}`, {
        friendRequestReceived: {
          id: `${context.user.id}-${friendId}`,
          fromPlayerId: context.user.id,
          toPlayerId: friendId,
          message,
          createdAt: Date.now(),
          status: 'PENDING'
        }
      });

      return {
        id: `${context.user.id}-${friendId}`,
        playerId: context.user.id,
        friendId,
        status: 'PENDING',
        createdAt: Date.now()
      };
    }),

    acceptFriendRequest: withErrorHandling(async (
      _: any,
      { requestId }: { requestId: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      // Parse requestId to get fromPlayerId
      const [fromPlayerId] = requestId.split('-');
      
      await context.services.socialService.addFriend(fromPlayerId, context.user.id);

      // Invalidate caches
      await context.cache.delete(`friends:${context.user.id}`);
      await context.cache.delete(`friends:${fromPlayerId}`);
      await context.cache.delete(`friendRequests:${context.user.id}`);

      // Publish subscription event
      context.pubsub.publish(`FRIEND_REQUEST_ACCEPTED:${fromPlayerId}`, {
        friendRequestAccepted: {
          id: requestId,
          playerId: fromPlayerId,
          friendId: context.user.id,
          status: 'ACCEPTED',
          createdAt: Date.now()
        }
      });

      return {
        id: requestId,
        playerId: fromPlayerId,
        friendId: context.user.id,
        status: 'ACCEPTED',
        createdAt: Date.now()
      };
    }),

    declineFriendRequest: withErrorHandling(async (
      _: any,
      { requestId }: { requestId: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      // In a real implementation, you'd update the request status
      // For now, just invalidate the cache
      await context.cache.delete(`friendRequests:${context.user.id}`);

      return true;
    }),

    removeFriend: withErrorHandling(async (
      _: any,
      { friendId }: { friendId: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      await context.services.socialService.removeFriend(context.user.id, friendId);

      // Invalidate caches
      await context.cache.delete(`friends:${context.user.id}`);
      await context.cache.delete(`friends:${friendId}`);

      return true;
    }),
  },

  Subscription: {
    friendRequestReceived: {
      subscribe: withErrorHandling(async (
        _: any,
        { playerId }: { playerId: string },
        context: Context
      ) => {
        if (!context.user || context.user.id !== playerId) {
          throw new GraphQLError('Access denied', {
            extensions: { code: 'FORBIDDEN' }
          });
        }

        return context.pubsub.asyncIterator(`FRIEND_REQUEST_RECEIVED:${playerId}`);
      }),
    },

    friendRequestAccepted: {
      subscribe: withErrorHandling(async (
        _: any,
        { playerId }: { playerId: string },
        context: Context
      ) => {
        if (!context.user || context.user.id !== playerId) {
          throw new GraphQLError('Access denied', {
            extensions: { code: 'FORBIDDEN' }
          });
        }

        return context.pubsub.asyncIterator(`FRIEND_REQUEST_ACCEPTED:${playerId}`);
      }),
    },
  },

  // Type resolvers
  SocialConnection: {
    friend: async (parent: SocialConnection, _: any, context: Context) => {
      return withCache(
        `profile:${parent.friendId}`,
        () => context.services.profileService.getProfile(parent.friendId),
        300
      );
    },
  },
};