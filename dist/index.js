"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = bootstrap;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
__exportStar(require("./types/core"), exports);
__exportStar(require("./types/services"), exports);
async function bootstrap() {
    console.log('🎮 Universal Gaming Hub - Starting...');
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
if (require.main === module) {
    bootstrap().catch((error) => {
        console.error('❌ Failed to start Universal Gaming Hub:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map