import { useState, useEffect } from 'react';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import { Friend, FriendRequest, CommunityQuest, PlayerDiscovery } from '../types/social';
import {
    GET_FRIENDS,
    GET_FRIEND_REQUESTS,
    GET_COMMUNITY_QUESTS,
    GET_PLAYER_SUGGESTIONS,
    SEND_FRIEND_REQUEST_MUTATION,
    RESPOND_TO_FRIEND_REQUEST_MUTATION,
    JOIN_QUEST_MUTATION,
    FRIEND_STATUS_UPDATES
} from '../graphql/socialQueries';

export const useFriends = (playerId: string) => {
    const [friends, setFriends] = useState<Friend[]>([]);

    const { data, loading, error, refetch } = useQuery(GET_FRIENDS, {
        variables: { playerId },
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all'
    });

    // Subscribe to friend status updates
    const { data: statusUpdate } = useSubscription(FRIEND_STATUS_UPDATES, {
        variables: { playerId }
    });

    useEffect(() => {
        if (data?.getFriends) {
            setFriends(data.getFriends);
        }
    }, [data]);

    useEffect(() => {
        if (statusUpdate?.friendStatusChanged) {
            const updatedFriend = statusUpdate.friendStatusChanged;
            setFriends(prev =>
                prev.map(friend =>
                    friend.friendId === updatedFriend.friendId
                        ? { ...friend, status: updatedFriend.status, lastSeen: updatedFriend.lastSeen }
                        : friend
                )
            );
        }
    }, [statusUpdate]);

    return {
        friends,
        loading,
        error,
        refetch
    };
};

export const useFriendRequests = (playerId: string) => {
    const { data, loading, error, refetch } = useQuery(GET_FRIEND_REQUESTS, {
        variables: { playerId },
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all'
    });

    const [sendFriendRequest] = useMutation(SEND_FRIEND_REQUEST_MUTATION);
    const [respondToRequest] = useMutation(RESPOND_TO_FRIEND_REQUEST_MUTATION);

    const friendRequests: FriendRequest[] = data?.getFriendRequests || [];

    const sendRequest = async (targetPlayerId: string, message?: string) => {
        try {
            const result = await sendFriendRequest({
                variables: { targetPlayerId, message }
            });
            return result.data?.sendFriendRequest;
        } catch (error) {
            console.error('Failed to send friend request:', error);
            throw error;
        }
    };

    const respondToFriendRequest = async (requestId: string, accept: boolean) => {
        try {
            const result = await respondToRequest({
                variables: { requestId, accept }
            });
            await refetch();
            return result.data?.respondToFriendRequest;
        } catch (error) {
            console.error('Failed to respond to friend request:', error);
            throw error;
        }
    };

    return {
        friendRequests,
        loading,
        error,
        sendRequest,
        respondToFriendRequest,
        refetch
    };
};

export const useCommunityQuests = () => {
    const { data, loading, error, refetch } = useQuery(GET_COMMUNITY_QUESTS, {
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all'
    });

    const [joinQuest] = useMutation(JOIN_QUEST_MUTATION);

    const quests: CommunityQuest[] = data?.getCommunityQuests || [];

    const joinCommunityQuest = async (questId: string) => {
        try {
            const result = await joinQuest({
                variables: { questId }
            });
            await refetch();
            return result.data?.joinQuest;
        } catch (error) {
            console.error('Failed to join quest:', error);
            throw error;
        }
    };

    return {
        quests,
        loading,
        error,
        joinCommunityQuest,
        refetch
    };
};

export const usePlayerDiscovery = (playerId: string) => {
    const { data, loading, error, refetch } = useQuery(GET_PLAYER_SUGGESTIONS, {
        variables: { playerId },
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all'
    });

    const suggestions: PlayerDiscovery[] = data?.getPlayerSuggestions || [];

    return {
        suggestions,
        loading,
        error,
        refetch
    };
};