import React from 'react';
import { Trophy, Star, Award, Crown } from 'lucide-react';
import { Achievement } from '../../types';

interface RecentAchievementsProps {
  achievements: Achievement[];
}

const RecentAchievements: React.FC<RecentAchievementsProps> = ({ achievements }) => {
  const getRarityIcon = (rarity: string) => {
    switch (rarity) {
      case 'LEGENDARY':
        return Crown;
      case 'EPIC':
        return Award;
      case 'RARE':
        return Star;
      default:
        return Trophy;
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'LEGENDARY':
        return 'text-yellow-500 bg-yellow-100';
      case 'EPIC':
        return 'text-purple-500 bg-purple-100';
      case 'RARE':
        return 'text-blue-500 bg-blue-100';
      default:
        return 'text-gray-500 bg-gray-100';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  if (achievements.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No recent achievements</p>
        <p className="text-sm">Keep playing to earn your first achievement!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {achievements.map((achievement) => {
        const Icon = getRarityIcon(achievement.rarity);
        const colorClass = getRarityColor(achievement.rarity);
        
        return (
          <div key={achievement.id} className="flex items-center p-3 bg-gray-50 rounded-lg">
            <div className={`p-2 rounded-lg ${colorClass}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">{achievement.title}</h4>
                <span className="text-xs text-gray-500">
                  {formatDate(achievement.earnedAt)}
                </span>
              </div>
              <p className="text-sm text-gray-600">{achievement.description}</p>
              <div className="flex items-center mt-1">
                <span className="text-xs text-gray-500">{achievement.gameName}</span>
                <span className={`ml-2 px-2 py-1 text-xs rounded-full ${colorClass}`}>
                  {achievement.rarity}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RecentAchievements;