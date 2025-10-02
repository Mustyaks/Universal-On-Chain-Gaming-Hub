import React from 'react';
import { Users, UserPlus, Trophy, Settings } from 'lucide-react';

interface SocialLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  friendRequestCount?: number;
}

const SocialLayout: React.FC<SocialLayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange,
  friendRequestCount = 0
}) => {
  const tabs = [
    { id: 'friends', label: 'Friends', icon: Users },
    { 
      id: 'discover', 
      label: 'Discover Players', 
      icon: UserPlus,
      badge: friendRequestCount > 0 ? friendRequestCount : undefined
    },
    { id: 'quests', label: 'Community Quests', icon: Trophy },
    { id: 'profile', label: 'Profile Settings', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Social Hub
            </h1>
            <div className="flex space-x-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`
                      relative flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors
                      ${activeTab === tab.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {tab.label}
                    {tab.badge && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </div>
    </div>
  );
};

export default SocialLayout;