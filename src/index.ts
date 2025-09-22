/**
 * Universal Gaming Hub - Main Application Entry Point
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Type definitions
export * from './types/core';
export * from './types/services';

// Main application bootstrap
async function bootstrap() {
  console.log('🎮 Universal Gaming Hub - Starting...');
  
  // Validate required environment variables
  const requiredEnvVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'STARKNET_RPC_URL',
    'JWT_SECRET'
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
  
  console.log('✅ Environment variables validated');
  console.log('🚀 Universal Gaming Hub ready for development');
  console.log('📚 Use "npm run dev" to start the development environment');
}

// Start the application
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('❌ Failed to start Universal Gaming Hub:', error);
    process.exit(1);
  });
}

export { bootstrap };