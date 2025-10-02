import React from 'react';
import { Clock, TrendingUp, Target } from 'lucide-react';
import { GameStatistics } from '../../types';

interface ProgressData {
  gameId: string;
  gameName: string;
  progress: number;
  nextMilestone: string;
}

interface GameProgressProps {
  gameStatistics: GameStatistics[];
  progressData: ProgressData[];
}

const GameProgress: React.FC<GameProgressProps> = ({ gameStatistics, progressData }) => {
  const combinedData = gameStatistics.map(stat => {
    const progress = progressData.find(p => p.gameId === stat.gameId);
    return {
      ...stat,
      progress: progress?.progress || 0,
      nextMilestone: progress?.nextMilestone || 'No milestone set'
    };
  });

  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  const formatLastPlayed = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {combinedData.map((game) => (
        <div key={game.gameId} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">{game.gameName}</h4>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                {formatHours(game.hoursPlayed)}
              </div>
              <div className="flex items-center">
                <TrendingUp className="w-4 h-4 mr-1" />
                Level {game.level}
              </div>
            </div>
          </div>
          
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">Progress</span>
              <span className="font-medium">{game.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${game.progress}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center text-gray-600">
              <Target className="w-4 h-4 mr-1" />
              <span>Next: {game.nextMilestone}</span>
            </div>
            <div className="text-gray-500">
              Last played: {formatLastPlayed(game.lastPlayed)}
            </div>
          </div>

          {game.rank && (
            <div className="mt-2 inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
              Rank: {game.rank}
            </div>
          )}
        </div>
      ))}
      
      {combinedData.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No games played yet</p>
          <p className="text-sm">Start playing to see your progress here!</p>
        </div>
      )}
    </div>
  );
};

export default GameProgress;