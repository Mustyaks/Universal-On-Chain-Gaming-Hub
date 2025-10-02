import React, { useState } from 'react';
import { useFriends, useFriendRequests, useCommunityQuests, usePlayerDiscovery } from '../../hooks/useSocial';
import { SocialSettings } from '../../types/social';
import SocialLayout from './SocialLayout';
import FriendsList from './FriendsList';
import PlayerDiscovery from './PlayerDiscovery';
import CommunityQuests from './CommunityQuests';
import ProfileSettings from './ProfileSettings';
import ErrorMessage from '../common/ErrorMessage';

interface SocialHubProps {
  playerId: string;
  initialSettings: SocialSettings;
  onUpdateSettings: (settings: SocialSettings) => Promise<void>;
}

const SocialHub: React.FC<SocialHubProps> = ({ 
  playerId, 
  initialSettings,
  onUpdateSettings 
}) => {
  const [activeTab, setActiveTab] = useState('friends');

  const {
    friends,
    loading: friendsLoading,
    error: friendsError,
    refetch: refetchFriends
  } = useFriends(playerId);

  const {
    friendRequests,
    loading: requestsLoading,
    error: requestsError,
    sendRequest,
    respondToFriendRequest,
    refetch: refetchRequests
  } = useFriendRequests(playerId);

  const {
    quests,
    loading: questsLoading,
    error: questsError,
    joinCommunityQuest,
    refetch: refetchQuests
  } = useCommunityQuests();

  const {
    suggestions,
    loading: suggestionsLoading,
    error: suggestionsError,
    refetch: refetchSuggestions
  } = usePlayerDiscovery(playerId);

  const handleSendFriendRequest = async (targetPlayerId: string, message?: string) => {
    try {
      await sendRequest(targetPlayerId, message);
      await Promise.all([refetchRequests(), refetchSuggestions()]);
    } catch (error) {
      console.error('Failed to send friend request:', error);
      throw error;
    }
  };

  const handleRespondToRequest = async (requestId: string, accept: boolean) => {
    try {
      await respondToFriendRequest(requestId, accept);
      if (accept) {
        await refetchFriends();
      }
    } catch (error) {
      console.error('Failed to respond to friend request:', error);
      throw error;
    }
  };

  const handleJoinQuest = async (questId: string) => {
    try {
      await joinCommunityQuest(questId);
    } catch (error) {
      console.error('Failed to join quest:', error);
      throw error;
    }
  };

  const pendingRequestsCount = friendRequests.filter(req => req.status === 'PENDING').length;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'friends':
        if (friendsError) {
          return (
            <ErrorMessage
              title="Failed to load friends"
              message={friendsError.message}
              onRetry={refetchFriends}
            />
          );
        }
        return (
          <FriendsList
            friends={friends}
            loading={friendsLoading}
            onRefresh={refetchFriends}
          />
        );

      case 'discover':
        if (requestsError || suggestionsError) {
          return (
            <ErrorMessage
              title="Failed to load player discovery"
              message={requestsError?.message || suggestionsError?.message || 'Unknown error'}
              onRetry={() => {
                refetchRequests();
                refetchSuggestions();
              }}
            />
          );
        }
        return (
          <PlayerDiscovery
            suggestions={suggestions}
            friendRequests={friendRequests}
            loading={requestsLoading || suggestionsLoading}
            onSendFriendRequest={handleSendFriendRequest}
            onRespondToRequest={handleRespondToRequest}
            onRefresh={() => {
              refetchRequests();
              refetchSuggestions();
            }}
          />
        );

      case 'quests':
        if (questsError) {
          return (
            <ErrorMessage
              title="Failed to load community quests"
              message={questsError.message}
              onRetry={refetchQuests}
            />
          );
        }
        return (
          <CommunityQuests
            quests={quests}
            loading={questsLoading}
            onJoinQuest={handleJoinQuest}
            onRefresh={refetchQuests}
          />
        );

      case 'profile':
        return (
          <ProfileSettings
            settings={initialSettings}
            onUpdateSettings={onUpdateSettings}
          />
        );

      default:
        return null;
    }
  };

  return (
    <SocialLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      friendRequestCount={pendingRequestsCount}
    >
      {renderTabContent()}
    </SocialLayout>
  );
};

export default SocialHub;