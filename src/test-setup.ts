/**
 * Jest test setup file
 */
import '@testing-library/jest-dom';

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    // Uncomment to ignore specific console methods during tests
    // log: jest.fn(),
    // debug: jest.fn(),
    // info: jest.fn(),
    // warn: jest.fn(),
    // error: jest.fn(),
};

// Set up global test timeout
jest.setTimeout(10000);

// Mock environment variables
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'test://localhost/test';
process.env['REDIS_URL'] = 'redis://localhost:6379/1';
process.env['JWT_SECRET'] = 'test-secret-key';
process.env['STARKNET_RPC_URL'] = 'https://test.starknet.io';

// Mock IntersectionObserver
(global as any).IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() { return []; }
};

// Mock ResizeObserver
(global as any).ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});