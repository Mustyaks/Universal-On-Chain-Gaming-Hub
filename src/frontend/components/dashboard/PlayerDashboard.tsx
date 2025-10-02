import React, { useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { useDashboardData } from '../../hooks/useDashboardData';
import DashboardLayout from './DashboardLayout';
import OverviewTab from './OverviewTab';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorMessage from '../common/ErrorMessage';

interface PlayerDashboardProps {
  playerId: string;
}

const PlayerDashboard: React.FC<PlayerDashboardProps> = ({ playerId }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const { dashboardData, loading, error, refreshData } = useDashboardData(playerId);

  if (loading && !dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorMessage 
          title="Failed to load dashboard"
          message={error.message}
          onRetry={refreshData}
        />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h2>
          <p className="text-gray-600 mb-4">Unable to load dashboard data</p>
          <button
            onClick={refreshData}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab data={dashboardData} />;
      case 'achievements':
        return <div>Achievements tab - Coming soon</div>;
      case 'games':
        return <div>Games tab - Coming soon</div>;
      case 'profile':
        return <div>Profile tab - Coming soon</div>;
      default:
        return <OverviewTab data={dashboardData} />;
    }
  };

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {error && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
            <p className="text-yellow-800">
              Some data may be outdated. 
              <button 
                onClick={refreshData}
                className="ml-2 text-yellow-600 hover:text-yellow-800 underline"
              >
                Refresh now
              </button>
            </p>
          </div>
        </div>
      )}
      
      {renderTabContent()}
    </DashboardLayout>
  );
};

export default PlayerDashboard;