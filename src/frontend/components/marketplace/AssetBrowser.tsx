import React, { useState } from 'react';
import { Search, Filter, Grid, List } from 'lucide-react';
import { MarketplaceListing, SearchFilters } from '../../types/marketplace';
import AssetCard from './AssetCard';
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';
import LoadingSpinner from '../common/LoadingSpinner';

interface AssetBrowserProps {
  listings: MarketplaceListing[];
  loading: boolean;
  filters: SearchFilters;
  onFiltersChange: (filters: Partial<SearchFilters>) => void;
  onPurchase: (listing: MarketplaceListing) => void;
}

const AssetBrowser: React.FC<AssetBrowserProps> = ({
  listings,
  loading,
  filters,
  onFiltersChange,
  onPurchase
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  if (loading && listings.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <SearchBar
            value={filters.searchTerm || ''}
            onChange={(searchTerm) => onFiltersChange({ searchTerm })}
            placeholder="Search assets by name, game, or description..."
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`
              flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${showFilters 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
          
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`
                p-2 transition-colors
                ${viewMode === 'grid' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
                }
              `}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`
                p-2 transition-colors
                ${viewMode === 'list' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
                }
              `}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          onFiltersChange={onFiltersChange}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {listings.length} asset{listings.length !== 1 ? 's' : ''} found
          </p>
          
          <select
            value={filters.sortBy || 'newest'}
            onChange={(e) => onFiltersChange({ sortBy: e.target.value as any })}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rarity">Rarity</option>
          </select>
        </div>

        {listings.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assets found</h3>
            <p className="text-gray-600">
              Try adjusting your search terms or filters to find what you're looking for.
            </p>
          </div>
        ) : (
          <div className={
            viewMode === 'grid' 
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
              : 'space-y-4'
          }>
            {listings.map((listing) => (
              <AssetCard
                key={listing.listingId}
                listing={listing}
                viewMode={viewMode}
                onPurchase={() => onPurchase(listing)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetBrowser;