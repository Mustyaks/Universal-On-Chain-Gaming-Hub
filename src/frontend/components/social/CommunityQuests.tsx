import React, { useState } from 'react';
import { Trophy, Users, Calendar, Target, Gift, Star, Award, Crown } from 'lucide-react';
import { CommunityQuest } from '../../types/social';
import LoadingSpinner from '../common/LoadingSpinner';

interface CommunityQuestsProps {
  quests: CommunityQuest[];
  loading: boolean;
  onJoinQuest: (questId: string) => Promise<void>;
  onRefresh: () => void;
}

const CommunityQuests: React.FC<CommunityQuestsProps> = ({
  quests,
  loading,
  onJoinQuest,
  onRefresh
}) => {
  const [joiningQuests, setJoiningQuests] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ACTIVE');

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case 'LEGENDARY':
        return Crown;
      case 'HARD':
        return Award;
      case 'MEDIUM':
        return Star;
      default:
        return Trophy;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'LEGENDARY':
        return 'text-yellow-600 bg-yellow-100';
      case 'HARD':
        return 'text-red-600 bg-red-100';
      case 'MEDIUM':
        return 'text-orange-600 bg-orange-100';
      case 'EASY':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'COMMUNITY':
        return 'text-purple-600 bg-purple-100';
      case 'TEAM':
        return 'text-blue-600 bg-blue-100';
      case 'INDIVIDUAL':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const handleJoinQuest = async (questId: string) => {
    setJoiningQuests(prev => new Set(prev).add(questId));
    try {
      await onJoinQuest(questId);
    } catch (error) {
      console.error('Failed to join quest:', error);
    } finally {
      setJoiningQuests(prev => {
        const newSet = new Set(prev);
        newSet.delete(questId);
        return newSet;
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const filteredQuests = quests.filter(quest => {
    if (filter === 'ALL') return true;
    return quest.status === filter;
  });

  if (loading && quests.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Community Quests
        </h2>
        
        <div className="flex items-center space-x-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Quests</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>
          
          <button
            onClick={onRefresh}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {filteredQuests.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {filter === 'ACTIVE' ? 'No active quests' : 'No quests found'}
          </h3>
          <p className="text-gray-600">
            {filter === 'ACTIVE' 
              ? 'Check back later for new community challenges!'
              : 'Try adjusting your filter to see more quests.'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredQuests.map((quest) => {
            const DifficultyIcon = getDifficultyIcon(quest.difficulty);
            const difficultyColor = getDifficultyColor(quest.difficulty);
            const typeColor = getTypeColor(quest.type);
            
            return (
              <div key={quest.questId} className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {quest.title}
                      </h3>
                      <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${difficultyColor}`}>
                        <DifficultyIcon className="w-3 h-3 mr-1" />
                        {quest.difficulty}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm text-gray-600">{quest.gameName}</span>
                      <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${typeColor}`}>
                        {quest.type}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-gray-700 mb-4">{quest.description}</p>

                {/* Requirements */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Requirements:</h4>
                  <div className="space-y-2">
                    {quest.requirements.map((req, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{req.description}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min((req.current / req.target) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-gray-600 font-medium">
                            {req.current}/{req.target}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rewards */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Rewards:</h4>
                  <div className="flex flex-wrap gap-2">
                    {quest.rewards.map((reward, index) => (
                      <div key={index} className="flex items-center px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                        <Gift className="w-3 h-3 mr-1" />
                        {reward.name}
                        {reward.rarity && (
                          <span className="ml-1 font-medium">({reward.rarity})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quest Info */}
                <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <Users className="w-4 h-4 mr-1" />
                      {quest.participants}
                      {quest.maxParticipants && `/${quest.maxParticipants}`} participants
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {formatDate(quest.startDate)}
                      {quest.endDate && ` - ${formatDate(quest.endDate)}`}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">Overall Progress</span>
                    <span className="font-medium">{quest.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${quest.progress}%` }}
                    />
                  </div>
                </div>

                {/* Action Button */}
                {quest.status === 'ACTIVE' && (
                  <button
                    onClick={() => handleJoinQuest(quest.questId)}
                    disabled={joiningQuests.has(quest.questId)}
                    className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                  >
                    <Target className="w-4 h-4 mr-2" />
                    {joiningQuests.has(quest.questId) ? 'Joining...' : 'Join Quest'}
                  </button>
                )}

                {quest.status === 'COMPLETED' && (
                  <div className="w-full flex items-center justify-center px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium">
                    <Trophy className="w-4 h-4 mr-2" />
                    Quest Completed
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommunityQuests;