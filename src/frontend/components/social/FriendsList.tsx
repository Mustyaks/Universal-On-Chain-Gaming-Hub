import React, { useState } from 'react';
import { Search, MessageCircle, Gamepad2, Clock, Users } from 'lucide-react';
import { Friend, FriendStatus } from '../../types/social';
import LoadingSpinner from '../common/LoadingSpinner';

interface FriendsListProps {
  friends: Friend[];
  loading: boolean;
  onRefresh: () => void;
}

const FriendsList: React.FC<FriendsListProps> = ({ friends, loading, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FriendStatus | 'ALL'>('ALL');

  const getStatusColor = (status: FriendStatus) => {
    switch (status) {
      case 'ONLINE':
        return 'bg-green-500';
      case 'IN_GAME':
        return 'bg-blue-500';
      case 'AWAY':
        return 'bg-yellow-500';
      case 'OFFLINE':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status: FriendStatus) => {
    switch (status) {
      case 'ONLINE':
        return 'Online';
      case 'IN_GAME':
        return 'In Game';
      case 'AWAY':
        return 'Away';
      case 'OFFLINE':
        return 'Offline';
      default:
        return 'Unknown';
    }
  };

  const formatLastSeen = (lastSeen: string) => {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const filteredFriends = friends.filter(friend => {
    const matchesSearch = friend.displayName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || friend.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const onlineFriends = friends.filter(f => f.status === 'ONLINE' || f.status === 'IN_GAME');

  if (loading && friends.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Friends ({friends.length})
          </h2>
          <div className="flex items-center text-sm text-gray-600">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
            {onlineFriends.length} online
          </div>
        </div>
        
        <button
          onClick={onRefresh}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search friends..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FriendStatus | 'ALL')}
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">All Status</option>
          <option value="ONLINE">Online</option>
          <option value="IN_GAME">In Game</option>
          <option value="AWAY">Away</option>
          <option value="OFFLINE">Offline</option>
        </select>
      </div>

      {/* Friends List */}
      {filteredFriends.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {friends.length === 0 ? 'No friends yet' : 'No friends found'}
          </h3>
          <p className="text-gray-600">
            {friends.length === 0 
              ? 'Start connecting with other players to build your gaming network!'
              : 'Try adjusting your search or filter criteria.'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFriends.map((friend) => (
            <div key={friend.friendId} className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-3 mb-3">
                <div className="relative">
                  <img
                    src={friend.avatar}
                    alt={friend.displayName}
                    className="w-12 h-12 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder-avatar.png';
                    }}
                  />
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(friend.status)} rounded-full border-2 border-white`}></div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {friend.displayName}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {getStatusText(friend.status)}
                  </p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {friend.mutualFriends > 0 && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Users className="w-4 h-4 mr-1" />
                    {friend.mutualFriends} mutual friends
                  </div>
                )}
                
                {friend.gamesInCommon.length > 0 && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Gamepad2 className="w-4 h-4 mr-1" />
                    {friend.gamesInCommon.length} games in common
                  </div>
                )}
                
                {friend.status === 'OFFLINE' && (
                  <div className="flex items-center text-sm text-gray-500">
                    <Clock className="w-4 h-4 mr-1" />
                    Last seen {formatLastSeen(friend.lastSeen)}
                  </div>
                )}
              </div>

              <div className="flex space-x-2">
                <button className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                  <MessageCircle className="w-4 h-4 mr-1" />
                  Message
                </button>
                <button className="flex items-center justify-center px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                  <Gamepad2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FriendsList;