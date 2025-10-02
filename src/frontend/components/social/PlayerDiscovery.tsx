import React, { useState } from 'react';
import { UserPlus, Users, Gamepad2, Trophy, Check, X } from 'lucide-react';
import { PlayerDiscovery as PlayerDiscoveryType, FriendRequest } from '../../types/social';
import LoadingSpinner from '../common/LoadingSpinner';

interface PlayerDiscoveryProps {
  suggestions: PlayerDiscoveryType[];
  friendRequests: FriendRequest[];
  loading: boolean;
  onSendFriendRequest: (playerId: string, message?: string) => Promise<void>;
  onRespondToRequest: (requestId: string, accept: boolean) => Promise<void>;
  onRefresh: () => void;
}

const PlayerDiscovery: React.FC<PlayerDiscoveryProps> = ({
  suggestions,
  friendRequests,
  loading,
  onSendFriendRequest,
  onRespondToRequest,
  onRefresh
}) => {
  const [sendingRequests, setSendingRequests] = useState<Set<string>>(new Set());
  const [respondingRequests, setRespondingRequests] = useState<Set<string>>(new Set());

  const handleSendRequest = async (playerId: string) => {
    setSendingRequests(prev => new Set(prev).add(playerId));
    try {
      await onSendFriendRequest(playerId);
    } catch (error) {
      console.error('Failed to send friend request:', error);
    } finally {
      setSendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(playerId);
        return newSet;
      });
    }
  };

  const handleRespondToRequest = async (requestId: string, accept: boolean) => {
    setRespondingRequests(prev => new Set(prev).add(requestId));
    try {
      await onRespondToRequest(requestId, accept);
    } catch (error) {
      console.error('Failed to respond to friend request:', error);
    } finally {
      setRespondingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const pendingRequests = friendRequests.filter(req => req.status === 'PENDING');

  if (loading && suggestions.length === 0 && friendRequests.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Friend Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Friend Requests ({pendingRequests.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingRequests.map((request) => (
              <div key={request.requestId} className="bg-white rounded-lg shadow border border-gray-200 p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <img
                    src={request.fromPlayerAvatar}
                    alt={request.fromPlayerName}
                    className="w-12 h-12 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder-avatar.png';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {request.fromPlayerName}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {new Date(request.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {request.message && (
                  <p className="text-sm text-gray-700 mb-4 p-2 bg-gray-50 rounded">
                    "{request.message}"
                  </p>
                )}

                <div className="flex space-x-2">
                  <button
                    onClick={() => handleRespondToRequest(request.requestId, true)}
                    disabled={respondingRequests.has(request.requestId)}
                    className="flex-1 flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespondToRequest(request.requestId, false)}
                    disabled={respondingRequests.has(request.requestId)}
                    className="flex-1 flex items-center justify-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player Suggestions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Suggested Players
          </h2>
          <button
            onClick={onRefresh}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Refresh
          </button>
        </div>

        {suggestions.length === 0 ? (
          <div className="text-center py-12">
            <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No suggestions available</h3>
            <p className="text-gray-600">
              Play more games and earn achievements to get better player suggestions!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map((player) => (
              <div key={player.playerId} className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-3 mb-3">
                  <img
                    src={player.avatar}
                    alt={player.displayName}
                    className="w-12 h-12 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder-avatar.png';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {player.displayName}
                    </h3>
                    <div className="flex items-center text-sm text-blue-600">
                      <span className="font-medium">{Math.round(player.matchScore)}% match</span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-3">{player.reason}</p>

                <div className="space-y-2 mb-4">
                  {player.mutualFriends > 0 && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="w-4 h-4 mr-1" />
                      {player.mutualFriends} mutual friends
                    </div>
                  )}
                  
                  {player.gamesInCommon.length > 0 && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Gamepad2 className="w-4 h-4 mr-1" />
                      {player.gamesInCommon.length} games in common
                    </div>
                  )}
                  
                  {player.recentAchievements > 0 && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Trophy className="w-4 h-4 mr-1" />
                      {player.recentAchievements} recent achievements
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleSendRequest(player.playerId)}
                  disabled={sendingRequests.has(player.playerId)}
                  className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {sendingRequests.has(player.playerId) ? 'Sending...' : 'Add Friend'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerDiscovery;