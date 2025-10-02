import React from 'react';
import { ApolloProvider } from '@apollo/client';
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom';
import { apolloClient } from './graphql/client';
import PlayerDashboard from './components/dashboard/PlayerDashboard';
import Marketplace from './components/marketplace/Marketplace';
import SocialHub from './components/social/SocialHub';
import Navigation from './components/common/Navigation';
import { SocialSettings } from './types/social';
import './styles/globals.css';

const App: React.FC = () => {
  // In a real app, this would come from authentication
  const playerId = 'demo-player-id';
  
  // Mock social settings - in real app this would come from user profile
  const mockSocialSettings: SocialSettings = {
    profileVisibility: 'PUBLIC',
    showAchievements: true,
    showAssets: true,
    showOnlineStatus: true,
    allowFriendRequests: true,
    allowMessages: true
  };

  const handleUpdateSocialSettings = async (settings: SocialSettings) => {
    // In real app, this would call an API to update settings
    console.log('Updating social settings:', settings);
  };

  return (
    <ApolloProvider client={apolloClient}>
      <Router>
        <div className="App">
          <Routes>
            <Route 
              path="/" 
              element={
                <div>
                  <Navigation />
                  <PlayerDashboard playerId={playerId} />
                </div>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <div>
                  <Navigation />
                  <PlayerDashboard playerId={playerId} />
                </div>
              } 
            />
            <Route 
              path="/dashboard/:playerId" 
              element={
                <div>
                  <Navigation />
                  <DashboardRoute />
                </div>
              } 
            />
            <Route 
              path="/marketplace" 
              element={
                <div>
                  <Navigation />
                  <Marketplace userId={playerId} />
                </div>
              } 
            />
            <Route 
              path="/social" 
              element={
                <div>
                  <Navigation />
                  <SocialHub 
                    playerId={playerId}
                    initialSettings={mockSocialSettings}
                    onUpdateSettings={handleUpdateSocialSettings}
                  />
                </div>
              } 
            />
          </Routes>
        </div>
      </Router>
    </ApolloProvider>
  );
};

const DashboardRoute: React.FC = () => {
  const { playerId } = useParams<{ playerId: string }>();
  
  if (!playerId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Player ID</h2>
          <p className="text-gray-600">Please provide a valid player ID</p>
        </div>
      </div>
    );
  }
  
  return <PlayerDashboard playerId={playerId} />;
};

export default App;