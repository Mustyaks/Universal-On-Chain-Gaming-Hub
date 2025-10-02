import { useState, useEffect } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import { DashboardData, Achievement, GameStatistics } from '../types';
import { GET_DASHBOARD_DATA, ACHIEVEMENT_UPDATES } from '../graphql/queries';

export const useDashboardData = (playerId: string) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  
  const { data, loading, error, refetch } = useQuery(GET_DASHBOARD_DATA, {
    variables: { playerId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  // Subscribe to real-time achievement updates
  const { data: achievementUpdate } = useSubscription(ACHIEVEMENT_UPDATES, {
    variables: { playerId }
  });

  useEffect(() => {
    if (data?.getDashboardData) {
      setDashboardData(data.getDashboardData);
    }
  }, [data]);

  // Handle real-time achievement updates
  useEffect(() => {
    if (achievementUpdate?.achievementEarned && dashboardData) {
      const newAchievement = achievementUpdate.achievementEarned;
      
      setDashboardData(prev => {
        if (!prev) return prev;
        
        return {
          ...prev,
          recentAchievements: [newAchievement, ...prev.recentAchievements.slice(0, 9)],
          profile: {
            ...prev.profile,
            totalAchievements: prev.profile.totalAchievements + 1
          }
        };
      });
    }
  }, [achievementUpdate, dashboardData]);

  const refreshData = () => {
    refetch();
  };

  return {
    dashboardData,
    loading,
    error,
    refreshData
  };
};