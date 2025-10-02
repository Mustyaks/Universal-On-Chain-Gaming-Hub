import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { SearchFilters } from '../../types/marketplace';

interface FilterPanelProps {
  filters: SearchFilters;
  onFiltersChange: (filters: Partial<SearchFilters>) => void;
  onClose: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ 
  filters, 
  onFiltersChange, 
  onClose 
}) => {
  const gameOptions = [
    { value: '', label: 'All Games' },
    { value: 'eternum', label: 'Eternum' },
    { value: 'loot-realms', label: 'Loot Realms' },
    { value: 'influence', label: 'Influence' },
    { value: 'briq', label: 'Briq' }
  ];

  const assetTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'NFT', label: 'NFTs' },
    { value: 'CURRENCY', label: 'Currencies' },
    { value: 'ITEM', label: 'Items' }
  ];

  const rarityOptions = [
    { value: '', label: 'All Rarities' },
    { value: 'COMMON', label: 'Common' },
    { value: 'RARE', label: 'Rare' },
    { value: 'EPIC', label: 'Epic' },
    { value: 'LEGENDARY', label: 'Legendary' }
  ];

  const clearAllFilters = () => {
    onFiltersChange({
      gameId: '',
      assetType: '',
      rarity: '',
      minPrice: undefined,
      maxPrice: undefined
    });
  };

  const hasActiveFilters = Boolean(
    filters.gameId || 
    filters.assetType || 
    filters.rarity || 
    filters.minPrice || 
    filters.maxPrice
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        <div className="flex items-center space-x-2">
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Clear All
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Game Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Game
          </label>
          <select
            value={filters.gameId || ''}
            onChange={(e) => onFiltersChange({ gameId: e.target.value || undefined })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {gameOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Asset Type Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Asset Type
          </label>
          <select
            value={filters.assetType || ''}
            onChange={(e) => onFiltersChange({ assetType: e.target.value || undefined })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {assetTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Rarity Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rarity
          </label>
          <select
            value={filters.rarity || ''}
            onChange={(e) => onFiltersChange({ rarity: e.target.value || undefined })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {rarityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Price Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Min Price (BTC)
          </label>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={filters.minPrice || ''}
            onChange={(e) => onFiltersChange({ 
              minPrice: e.target.value ? parseFloat(e.target.value) : undefined 
            })}
            placeholder="0.000000"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Price (BTC)
          </label>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={filters.maxPrice || ''}
            onChange={(e) => onFiltersChange({ 
              maxPrice: e.target.value ? parseFloat(e.target.value) : undefined 
            })}
            placeholder="1.000000"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;