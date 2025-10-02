import React from 'react';
import { Bitcoin, ExternalLink, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react';
import { MarketplaceTransaction } from '../../types/marketplace';
import LoadingSpinner from '../common/LoadingSpinner';

interface TransactionHistoryProps {
  transactions: MarketplaceTransaction[];
  loading: boolean;
  onRefresh: () => void;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  loading,
  onRefresh
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return CheckCircle;
      case 'PENDING':
      case 'CONFIRMING':
        return Clock;
      case 'FAILED':
      case 'CANCELLED':
        return XCircle;
      case 'REFUNDED':
        return RefreshCw;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-green-600 bg-green-100';
      case 'PENDING':
      case 'CONFIRMING':
        return 'text-yellow-600 bg-yellow-100';
      case 'FAILED':
      case 'CANCELLED':
        return 'text-red-600 bg-red-100';
      case 'REFUNDED':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'BUY':
        return 'Purchase';
      case 'SELL':
        return 'Sale';
      case 'SWAP':
        return 'Swap';
      default:
        return type;
    }
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Transaction History</h2>
        <button
          onClick={onRefresh}
          className="flex items-center px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <Bitcoin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h3>
          <p className="text-gray-600">
            Your marketplace transactions will appear here once you start buying or selling assets.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((transaction) => {
            const StatusIcon = getStatusIcon(transaction.status);
            const statusColor = getStatusColor(transaction.status);
            
            return (
              <div key={transaction.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <img
                      src={transaction.asset.metadata.image}
                      alt={transaction.asset.metadata.name}
                      className="w-12 h-12 rounded-lg object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder-asset.png';
                      }}
                    />
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {transaction.asset.metadata.name}
                      </h3>
                      <p className="text-sm text-gray-600">{transaction.asset.gameName}</p>
                    </div>
                  </div>
                  
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${statusColor}`}>
                    <StatusIcon className="w-4 h-4 mr-1" />
                    {transaction.status}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Type</p>
                    <p className="font-medium">{getTransactionTypeLabel(transaction.type)}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600">Amount</p>
                    <div className="flex items-center font-medium">
                      <Bitcoin className="w-4 h-4 text-orange-500 mr-1" />
                      {transaction.btcAmount.toFixed(6)}
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="font-medium">{formatDate(transaction.createdAt)}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600">Transaction ID</p>
                    <p className="font-mono text-sm truncate" title={transaction.id}>
                      {transaction.id}
                    </p>
                  </div>
                </div>

                {transaction.txHash && (
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div>
                      <p className="text-sm text-gray-600">Blockchain Transaction</p>
                      <p className="font-mono text-sm text-gray-800 truncate" title={transaction.txHash}>
                        {transaction.txHash}
                      </p>
                    </div>
                    <button
                      onClick={() => window.open(`https://blockstream.info/tx/${transaction.txHash}`, '_blank')}
                      className="flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      View on Explorer
                    </button>
                  </div>
                )}

                {transaction.errorMessage && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{transaction.errorMessage}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;