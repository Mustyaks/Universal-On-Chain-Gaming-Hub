import React from 'react';
import { Bitcoin, Star, Award, Crown, Trophy } from 'lucide-react';
import { MarketplaceListing } from '../../types/marketplace';

interface AssetCardProps {
  listing: MarketplaceListing;
  viewMode: 'grid' | 'list';
  onPurchase: () => void;
}

const AssetCard: React.FC<AssetCardProps> = ({ listing, viewMode, onPurchase }) => {
  const { asset, priceInBTC, sellerName, createdAt } = listing;

  const getRarityIcon = (rarity?: string) => {
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

  const getRarityColor = (rarity?: string) => {
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
    return date.toLocaleDateString();
  };

  if (viewMode === 'list') {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow">
        <div className="flex items-center space-x-4">
          <div className="flex-shrink-0">
            <img
              src={asset.metadata.image}
              alt={asset.metadata.name}
              className="w-16 h-16 rounded-lg object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder-asset.png';
              }}
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {asset.metadata.name}
              </h3>
              {asset.rarity && (
                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${getRarityColor(asset.rarity)}`}>
                  {React.createElement(getRarityIcon(asset.rarity), { className: 'w-3 h-3 mr-1' })}
                  {asset.rarity}
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600 mb-1">{asset.gameName}</p>
            <p className="text-xs text-gray-500">Listed by {sellerName} • {formatDate(createdAt)}</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="flex items-center text-lg font-bold text-gray-900">
                <Bitcoin className="w-5 h-5 text-orange-500 mr-1" />
                {priceInBTC.toFixed(6)}
              </div>
              {asset.estimatedValue && (
                <p className="text-sm text-gray-500">
                  ~${asset.estimatedValue.toFixed(2)}
                </p>
              )}
            </div>
            
            <button
              onClick={onPurchase}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square relative">
        <img
          src={asset.metadata.image}
          alt={asset.metadata.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder-asset.png';
          }}
        />
        {asset.rarity && (
          <div className={`absolute top-2 right-2 inline-flex items-center px-2 py-1 rounded-full text-xs ${getRarityColor(asset.rarity)}`}>
            {React.createElement(getRarityIcon(asset.rarity), { className: 'w-3 h-3 mr-1' })}
            {asset.rarity}
          </div>
        )}
      </div>
      
      <div className="p-4">
        <div className="mb-2">
          <h3 className="font-semibold text-gray-900 truncate" title={asset.metadata.name}>
            {asset.metadata.name}
          </h3>
          <p className="text-sm text-gray-600">{asset.gameName}</p>
        </div>
        
        <p className="text-sm text-gray-700 mb-3 line-clamp-2">
          {asset.metadata.description}
        </p>
        
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center text-lg font-bold text-gray-900">
            <Bitcoin className="w-5 h-5 text-orange-500 mr-1" />
            {priceInBTC.toFixed(6)}
          </div>
          {asset.estimatedValue && (
            <span className="text-sm text-gray-500">
              ~${asset.estimatedValue.toFixed(2)}
            </span>
          )}
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
          <span>By {sellerName}</span>
          <span>{formatDate(createdAt)}</span>
        </div>
        
        <button
          onClick={onPurchase}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Buy Now
        </button>
      </div>
    </div>
  );
};

export default AssetCard;