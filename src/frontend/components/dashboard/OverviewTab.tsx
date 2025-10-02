import React from 'react';
import { Trophy, Coins, Gamepad2, TrendingUp } from 'lucide-react';
import { DashboardData } from '../../types';
import StatsCard from './StatsCard';
import ProgressChart from './ProgressChart';
import RecentAchievements from './RecentAchievements';
import GameProgress from './GameProgress';

interface OverviewTabProps {
  data: DashboardData;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ data }) => {
  const stats = [
    {
      title: 'Total Achievements',
      value: data.profile.totalAchievements.toString(),
      icon: Trophy,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    {
      title: 'Total Assets',
      value: data.assetSummary.totalAssets.toString(),
      icon: Coins,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Games Played',
      value: data.gameStatistics.length.toString(),
      icon: Gamepad2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Portfolio Value',
      value: `${data.assetSummary.totalValue.toFixed(2)} BTC`,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <StatsCard key={index} {...stat} />
        ))}
      </div>

      {/* Charts and Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Game Progress Overview
          </h3>
          <ProgressChart data={data.progressData} />
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Achievements
          </h3>
          <RecentAchievements achievements={data.recentAchievements.slice(0, 5)} />
        </div>
      </div>

      {/* Game Progress Details */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Game Progress Details
        </h3>
        <GameProgress 
          gameStatistics={data.gameStatistics}
          progressData={data.progressData}
        />
      </div>
    </div>
  );
};

export default OverviewTab;