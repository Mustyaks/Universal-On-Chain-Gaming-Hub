import { EventEmitter } from 'events';
import { Timestamp } from '../../types/core';
export interface WebSocketGameClientConfig {
    gameId: string;
    wsEndpoint: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
    heartbeatInterval: number;
    messageTimeout: number;
}
export interface GameWebSocketMessage {
    type: 'PLAYER_UPDATE' | 'ASSET_CHANGE' | 'ACHIEVEMENT_EARNED' | 'HEARTBEAT' | 'ERROR';
    playerId?: string;
    data?: any;
    timestamp: Timestamp;
}
export declare class WebSocketGameClient extends EventEmitter {
    private config;
    private ws;
    private isConnected;
    private reconnectAttempts;
    private heartbeatTimer;
    private reconnectTimer;
    private subscribedPlayers;
    constructor(config: WebSocketGameClientConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    subscribeToPlayer(playerId: string): Promise<void>;
    unsubscribeFromPlayer(playerId: string): Promise<void>;
    private sendMessage;
    isClientConnected(): boolean;
    getConnectionStatus(): {
        connected: boolean;
        gameId: string;
        subscribedPlayers: number;
        reconnectAttempts: number;
    };
    private handleConnection;
    private handleDisconnection;
    private handleMessage;
    private handlePlayerUpdate;
    private handleAssetChange;
    private handleAchievementEarned;
    private handleGameError;
    private handleError;
    private startHeartbeat;
    private scheduleReconnect;
    private waitForConnection;
}
//# sourceMappingURL=WebSocketGameClient.d.ts.map