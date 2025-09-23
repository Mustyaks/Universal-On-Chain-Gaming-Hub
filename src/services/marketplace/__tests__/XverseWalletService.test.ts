/**
 * Xverse Wallet Service Tests
 */

import { XverseWalletService } from '../XverseWalletService';

// Mock the window object and Xverse provider
const mockXverseProvider = {
  request: jest.fn()
};

const mockWindow = {
  XverseProviders: {
    BitcoinProvider: mockXverseProvider
  }
};

// Mock window object
Object.defineProperty(global, 'window', {
  value: mockWindow,
  writable: true
});

describe('XverseWalletService', () => {
  let xverseService: XverseWalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    xverseService = new XverseWalletService();
  });

  describe('connectWallet', () => {
    it('should connect wallet successfully', async () => {
      const mockAccount = {
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        publicKey: '0x123456789abcdef'
      };

      mockXverseProvider.request.mockResolvedValueOnce({
        result: [mockAccount]
      });

      const connection = await xverseService.connectWallet();

      expect(connection).toEqual({
        address: mockAccount.address,
        publicKey: mockAccount.publicKey,
        connected: true
      });

      expect(mockXverseProvider.request).toHaveBeenCalledWith('getAccounts', null);
    });

    it('should throw error if Xverse is not available', async () => {
      // Temporarily remove Xverse from window
      const originalWindow = (global as any).window;
      (global as any).window = {};

      await expect(xverseService.connectWallet())
        .rejects.toThrow('Xverse wallet is not installed');

      // Restore window
      (global as any).window = originalWindow;
    });

    it('should throw error if no accounts found', async () => {
      mockXverseProvider.request.mockResolvedValueOnce({
        result: []
      });

      await expect(xverseService.connectWallet())
        .rejects.toThrow('No Bitcoin accounts found in Xverse wallet');
    });

    it('should throw error if request fails', async () => {
      mockXverseProvider.request.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(xverseService.connectWallet())
        .rejects.toThrow('Failed to connect to Xverse wallet: Connection failed');
    });
  });

  describe('signTransaction', () => {
    beforeEach(async () => {
      // Connect wallet first
      mockXverseProvider.request.mockResolvedValueOnce({
        result: [{
          address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          publicKey: '0x123456789abcdef'
        }]
      });
      await xverseService.connectWallet();
      jest.clearAllMocks();
    });

    it('should sign transaction successfully', async () => {
      const mockTransaction = {
        hex: '0x123456789abcdef',
        inputs: [],
        outputs: []
      };

      const mockSignedHex = '0x987654321fedcba';

      mockXverseProvider.request.mockResolvedValueOnce({
        result: { hex: mockSignedHex }
      });

      const signedHex = await xverseService.signTransaction(mockTransaction);

      expect(signedHex).toBe(mockSignedHex);
      expect(mockXverseProvider.request).toHaveBeenCalledWith('signTransaction', {
        hex: mockTransaction.hex,
        broadcast: false
      });
    });

    it('should throw error if wallet not connected', async () => {
      const disconnectedService = new XverseWalletService();
      
      await expect(disconnectedService.signTransaction({
        hex: '0x123',
        inputs: [],
        outputs: []
      })).rejects.toThrow('Wallet not connected');
    });

    it('should throw error if signing fails', async () => {
      mockXverseProvider.request.mockResolvedValueOnce({
        result: null
      });

      await expect(xverseService.signTransaction({
        hex: '0x123',
        inputs: [],
        outputs: []
      })).rejects.toThrow('Transaction signing failed');
    });
  });

  describe('getBalance', () => {
    it('should get balance successfully', async () => {
      const mockBalance = 50000000; // 0.5 BTC in satoshis

      mockXverseProvider.request.mockResolvedValueOnce({
        result: { confirmed: mockBalance }
      });

      const balance = await xverseService.getBalance('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');

      expect(balance).toBe(0.5); // Converted to BTC
      expect(mockXverseProvider.request).toHaveBeenCalledWith('getBalance', null);
    });

    it('should throw error if balance request fails', async () => {
      mockXverseProvider.request.mockResolvedValueOnce({
        result: undefined
      });

      await expect(xverseService.getBalance('invalid_address'))
        .rejects.toThrow('Failed to retrieve balance');
    });
  });

  describe('sendBitcoin', () => {
    beforeEach(async () => {
      // Connect wallet first
      mockXverseProvider.request.mockResolvedValueOnce({
        result: [{
          address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          publicKey: '0x123456789abcdef'
        }]
      });
      await xverseService.connectWallet();
      jest.clearAllMocks();
    });

    it('should send Bitcoin successfully', async () => {
      const toAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      const amount = 0.001;
      const mockTxid = 'abc123def456';

      mockXverseProvider.request.mockResolvedValueOnce({
        result: { txid: mockTxid }
      });

      const result = await xverseService.sendBitcoin(toAddress, amount);

      expect(result).toEqual({
        txid: mockTxid,
        amount,
        toAddress,
        fromAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        status: 'PENDING'
      });

      expect(mockXverseProvider.request).toHaveBeenCalledWith('sendTransfer', {
        recipients: [{
          address: toAddress,
          amount: 100000 // 0.001 BTC in satoshis
        }]
      });
    });

    it('should throw error if wallet not connected', async () => {
      const disconnectedService = new XverseWalletService();
      
      await expect(disconnectedService.sendBitcoin('address', 0.001))
        .rejects.toThrow('Wallet not connected');
    });
  });

  describe('createPaymentRequest', () => {
    beforeEach(async () => {
      // Connect wallet first
      mockXverseProvider.request.mockResolvedValueOnce({
        result: [{
          address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          publicKey: '0x123456789abcdef'
        }]
      });
      await xverseService.connectWallet();
      jest.clearAllMocks();
    });

    it('should create payment request successfully', async () => {
      const amount = 0.001;
      const description = 'Test payment';

      const paymentRequest = await xverseService.createPaymentRequest(amount, description);

      expect(paymentRequest).toMatchObject({
        amount,
        description,
        recipientAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        status: 'PENDING'
      });

      expect(paymentRequest.paymentId).toBeDefined();
      expect(paymentRequest.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should use default description if not provided', async () => {
      const paymentRequest = await xverseService.createPaymentRequest(0.001);

      expect(paymentRequest.description).toBe('Gaming Hub Marketplace Payment');
    });
  });

  describe('verifyPayment', () => {
    it('should verify payment successfully', async () => {
      const paymentId = 'payment_123';
      const expectedAmount = 0.001;

      const verification = await xverseService.verifyPayment(paymentId, expectedAmount);

      expect(verification).toMatchObject({
        paymentId,
        verified: true,
        amount: expectedAmount,
        confirmations: 1
      });

      expect(verification.txid).toBeDefined();
      expect(verification.timestamp).toBeDefined();
    });
  });

  describe('getCurrentConnection', () => {
    it('should return null when not connected', () => {
      const connection = xverseService.getCurrentConnection();
      expect(connection).toBeNull();
    });

    it('should return connection when connected', async () => {
      const mockAccount = {
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        publicKey: '0x123456789abcdef'
      };

      mockXverseProvider.request.mockResolvedValueOnce({
        result: [mockAccount]
      });

      await xverseService.connectWallet();
      const connection = xverseService.getCurrentConnection();

      expect(connection).toEqual({
        address: mockAccount.address,
        publicKey: mockAccount.publicKey,
        connected: true
      });
    });
  });

  describe('disconnect', () => {
    it('should disconnect wallet', async () => {
      // Connect first
      mockXverseProvider.request.mockResolvedValueOnce({
        result: [{
          address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          publicKey: '0x123456789abcdef'
        }]
      });

      await xverseService.connectWallet();
      expect(xverseService.getCurrentConnection()).not.toBeNull();

      xverseService.disconnect();
      expect(xverseService.getCurrentConnection()).toBeNull();
    });
  });
});