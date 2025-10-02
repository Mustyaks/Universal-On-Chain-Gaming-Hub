import React from 'react';
import { Search, Filter, Wallet, History } from 'lucide-react';

interface MarketplaceLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  walletConnected: boolean;
  onConnectWallet: () => void;
}

const MarketplaceLayout: React.FC<MarketplaceLayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange,
  walletConnected,
  onConnectWallet
}) => {
  const tabs = [
    { id: 'browse', label: 'Browse Assets', icon: Search },
    { id: 'transactions', label: 'My Transactions', icon: History }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Asset Marketplace
            </h1>
            
            <div className="flex items-center space-x-4">
              <div className="flex space-x-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className={`
                        flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors
                        ${activeTab === tab.id
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }
                      `}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={onConnectWallet}
                className={`
                  flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${walletConnected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                  }
                `}
              >
                <Wallet className="w-4 h-4 mr-2" />
                {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
              </button>
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

export default MarketplaceLayout;