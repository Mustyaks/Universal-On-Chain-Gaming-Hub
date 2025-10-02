import React, { useState } from 'react';
import { MarketplaceListing } from '../../types/marketplace';
import { useMarketplace, useUserTransactions } from '../../hooks/useMarketplace';
import { useXverseWallet } from '../../hooks/useXverseWallet';
import MarketplaceLayout from './MarketplaceLayout';
import AssetBrowser from './AssetBrowser';
import TransactionHistory from './TransactionHistory';
import PurchaseModal from './PurchaseModal';
import ErrorMessage from '../common/ErrorMessage';

interface MarketplaceProps {
  userId: string;
}

const Marketplace: React.FC<MarketplaceProps> = ({ userId }) => {
  const [activeTab, setActiveTab] = useState('browse');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  
  const {
    listings,
    loading: marketplaceLoading,
    error: marketplaceError,
    filters,
    updateFilters,
    purchaseAssetWithBTC,
    refetch: refetchListings
  } = useMarketplace();

  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
    refetch: refetchTransactions
  } = useUserTransactions(userId);

  const {
    walletInfo,
    isConnecting,
    paymentFlow,
    connectWallet,
    initiatePayment,
    resetPaymentFlow
  } = useXverseWallet();

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handlePurchase = (listing: MarketplaceListing) => {
    setSelectedListing(listing);
    resetPaymentFlow();
  };

  const handleConfirmPurchase = async () => {
    if (!selectedListing || !walletInfo) return;

    try {
      // Initiate Bitcoin payment
      const txHash = await initiatePayment(selectedListing.listingId, selectedListing.priceInBTC);
      
      if (txHash) {
        // Call backend to process the purchase
        await purchaseAssetWithBTC(selectedListing.listingId, walletInfo.address);
        
        // Refresh data
        await Promise.all([
          refetchListings(),
          refetchTransactions()
        ]);
      }
    } catch (error) {
      console.error('Purchase failed:', error);
      throw error;
    }
  };

  const handleClosePurchaseModal = () => {
    setSelectedListing(null);
    resetPaymentFlow();
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'browse':
        return (
          <AssetBrowser
            listings={listings}
            loading={marketplaceLoading}
            filters={filters}
            onFiltersChange={updateFilters}
            onPurchase={handlePurchase}
          />
        );
      case 'transactions':
        return (
          <TransactionHistory
            transactions={transactions}
            loading={transactionsLoading}
            onRefresh={refetchTransactions}
          />
        );
      default:
        return null;
    }
  };

  if (marketplaceError && !listings.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorMessage
          title="Failed to load marketplace"
          message={marketplaceError.message}
          onRetry={refetchListings}
        />
      </div>
    );
  }

  return (
    <>
      <MarketplaceLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        walletConnected={!!walletInfo?.connected}
        onConnectWallet={handleConnectWallet}
      >
        {(marketplaceError || transactionsError) && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800">
              {marketplaceError?.message || transactionsError?.message}
            </p>
          </div>
        )}
        
        {renderTabContent()}
      </MarketplaceLayout>

      {selectedListing && (
        <PurchaseModal
          listing={selectedListing}
          paymentFlow={paymentFlow}
          walletConnected={!!walletInfo?.connected}
          onClose={handleClosePurchaseModal}
          onConnectWallet={handleConnectWallet}
          onConfirmPurchase={handleConfirmPurchase}
        />
      )}
    </>
  );
};

export default Marketplace;