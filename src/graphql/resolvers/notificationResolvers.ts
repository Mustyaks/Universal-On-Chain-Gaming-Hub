import { GraphQLError } from 'graphql';
import { Context } from '../context';
import { withCache, withErrorHandling } from '../utils/resolverUtils';

export const notificationResolvers = {
  Query: {
    notifications: withErrorHandling(async (
      _: any,
      { playerId, unreadOnly = false }: { playerId: string; unreadOnly?: boolean },
      context: Context
    ) => {
      if (!context.user || context.user.id !== playerId) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      return withCache(
        `notifications:${playerId}:${unreadOnly}`,
        () => context.services.notificationService.getNotifications(playerId, unreadOnly),
        60 // 1 minute cache for notifications
      );
    }),
  },

  Mutation: {
    markNotificationAsRead: withErrorHandling(async (
      _: any,
      { notificationId }: { notificationId: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      await context.services.notificationService.markAsRead(notificationId);

      // Invalidate cache
      await context.cache.invalidatePattern(`notifications:${context.user.id}:*`);

      return true;
    }),

    markAllNotificationsAsRead: withErrorHandling(async (
      _: any,
      __: any,
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const notifications = await context.services.notificationService.getNotifications(
        context.user.id,
        true
      );

      await Promise.all(
        notifications.map(notification =>
          context.services.notificationService.markAsRead(notification.id)
        )
      );

      // Invalidate cache
      await context.cache.invalidatePattern(`notifications:${context.user.id}:*`);

      return true;
    }),
  },

  Subscription: {
    notificationReceived: {
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

        return context.pubsub.asyncIterator(`NOTIFICATION_RECEIVED:${playerId}`);
      }),
    },
  },
};