import React, { useState } from 'react';
import { X, Bitcoin, Wallet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { MarketplaceListing, PaymentFlow } from '../../types/marketplace';

interface PurchaseModalProps {
  listing: MarketplaceListing;
  paymentFlow: PaymentFlow | null;
  walletConnected: boolean;
  onClose: () => void;
  onConnectWallet: () => Promise<void>;
  onConfirmPurchase: () => Promise<void>;
}

const PurchaseModal: React.FC<PurchaseModalProps> = ({
  listing,
  paymentFlow,
  walletConnected,
  onClose,
  onConnectWallet,
  onConfirmPurchase
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePurchase = async () => {
    setIsProcessing(true);
    try {
      await onConfirmPurchase();
    } catch (error) {
      console.error('Purchase failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderStep = () => {
    if (!walletConnected) {
      return (
        <div className="text-center py-6">
          <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Connect Your Wallet
          </h3>
          <p className="text-gray-600 mb-6">
            Connect your Xverse wallet to purchase this asset with Bitcoin.
          </p>
          <button
            onClick={onConnectWallet}
            className="w-full px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
          >
            Connect Xverse Wallet
          </button>
        </div>
      );
    }

    if (paymentFlow?.step === 'PROCESSING' || isProcessing) {
      return (
        <div className="text-center py-6">
          <Loader2 className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Processing Payment
          </h3>
          <p className="text-gray-600">
            Please confirm the transaction in your Xverse wallet...
          </p>
        </div>
      );
    }

    if (paymentFlow?.step === 'COMPLETED') {
      return (
        <div className="text-center py-6">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Purchase Successful!
          </h3>
          <p className="text-gray-600 mb-4">
            Your asset will be transferred once the Bitcoin transaction is confirmed.
          </p>
          {paymentFlow.txHash && (
            <p className="text-sm text-gray-500 break-all">
              Transaction: {paymentFlow.txHash}
            </p>
          )}
        </div>
      );
    }

    if (paymentFlow?.step === 'FAILED') {
      return (
        <div className="text-center py-6">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Purchase Failed
          </h3>
          <p className="text-gray-600 mb-4">
            {paymentFlow.errorMessage || 'An error occurred during the purchase.'}
          </p>
          <button
            onClick={handlePurchase}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Confirm Purchase
          </h3>
          <p className="text-gray-600">
            You're about to purchase this asset with Bitcoin.
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Asset:</span>
            <span className="font-medium">{listing.asset.metadata.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Game:</span>
            <span className="font-medium">{listing.asset.gameName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Seller:</span>
            <span className="font-medium">{listing.sellerName}</span>
          </div>
          <div className="border-t pt-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Price:</span>
              <div className="flex items-center font-bold text-lg">
                <Bitcoin className="w-5 h-5 text-orange-500 mr-1" />
                {listing.priceInBTC.toFixed(6)} BTC
              </div>
            </div>
            {listing.asset.estimatedValue && (
              <div className="text-right text-sm text-gray-500">
                ~${listing.asset.estimatedValue.toFixed(2)} USD
              </div>
            )}
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePurchase}
            disabled={isProcessing}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Confirm Purchase'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Purchase Asset
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Asset Preview */}
          <div className="flex items-center space-x-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <img
              src={listing.asset.metadata.image}
              alt={listing.asset.metadata.name}
              className="w-16 h-16 rounded-lg object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder-asset.png';
              }}
            />
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">
                {listing.asset.metadata.name}
              </h4>
              <p className="text-sm text-gray-600">{listing.asset.gameName}</p>
              {listing.asset.rarity && (
                <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full mt-1">
                  {listing.asset.rarity}
                </span>
              )}
            </div>
          </div>

          {renderStep()}
        </div>
      </div>
    </div>
  );
};

export default PurchaseModal;