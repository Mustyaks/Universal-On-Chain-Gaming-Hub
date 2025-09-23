/**
 * Marketplace Service Module
 * Exports all marketplace-related services and components
 */

export { MarketplaceService } from './MarketplaceService';
export { MarketplaceController } from './MarketplaceController';
export { createMarketplaceRoutes } from './MarketplaceRoutes';
export { AssetValidationService, ValidationResult } from './AssetValidationService';

// Bitcoin payment components
export { XverseWalletService } from './XverseWalletService';
export { BitcoinPaymentProcessor } from './BitcoinPaymentProcessor';
export { PaymentController } from './PaymentController';
export { createPaymentRoutes } from './PaymentRoutes';

// Cross-chain swap components
export { AtomiqService } from './AtomiqService';
export { SwapController } from './SwapController';
export { createSwapRoutes } from './SwapRoutes';
export { SwapFallbackService } from './SwapFallbackService';

// Transaction monitoring and recovery components
export { TransactionMonitoringService } from './TransactionMonitoringService';
export { TransactionRecoveryController } from './TransactionRecoveryController';
export { createTransactionRecoveryRoutes } from './TransactionRecoveryRoutes';
export { AutomatedRefundService } from './AutomatedRefundService';

// Payment types
export type {
    BitcoinTransaction,
    BitcoinTransactionResult,
    PaymentRequest,
    PaymentVerification
} from './XverseWalletService';

export type {
    PaymentProcessingResult,
    PaymentStatus,
    RefundResult
} from './BitcoinPaymentProcessor';

// Swap types
export type {
    FallbackResult,
    RetryResult,
    FailedSwap,
    RefundInitiation,
    ProcessedRetries
} from './SwapFallbackService';

// Transaction monitoring types
export type {
    MonitoringResult,
    TransactionMonitorResult,
    TransactionStatusInfo,
    RecoveryResult,
    FailedTransaction
} from './TransactionMonitoringService';

// Refund types
export type {
    RefundProcessingResult,
    RefundStatus,
    RefundEligibility,
    BitcoinRefundResult
} from './AutomatedRefundService';