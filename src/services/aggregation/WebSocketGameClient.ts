/**
 * WebSocket client for connecting to Dojo games
 * Handles real-time data streaming from game networks
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
    PlayerGameData,
    StandardizedGameData,
    GameHubError,
    Timestamp
} from '../../types/core';

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

export class WebSocketGameClient extends EventEmitter {
    private config: WebSocketGameClientConfig;
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private subscribedPlayers: Set<string> = new Set();

    constructor(config: WebSocketGameClientConfig) {
        super();
        this.config = config;
    }

    /**
     * Connect to the game's WebSocket endpoint
     */
    async connect(): Promise<void> {
        if (this.isConnected) {
            return;
        }

        try {
            this.ws = new WebSocket(this.config.wsEndpoint);
            
            this.ws.on('open', () => {
                this.handleConnection();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code, reason) => {
                this.handleDisconnection(code, reason.toString());
            });

            this.ws.on('error', (error) => {
                this.handleError(error);
            });

            // Wait for connection or timeout
            await this.waitForConnection();
            
        } catch (error) {
            console.error(`Failed to connect to ${this.config.gameId} WebSocket:`, error);
            throw error;
        }
    }

    /**
     * Disconnect from the WebSocket
     */
    async disconnect(): Promise<void> {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.subscribedPlayers.clear();
    }

    /**
     * Subscribe to updates for a specific player
     */
    async subscribeToPlayer(playerId: string): Promise<void> {
        if (!this.isConnected) {
            throw new Error('WebSocket not connected');
        }

        if (this.subscribedPlayers.has(playerId)) {
            return; // Already subscribed
        }

        const message = {
            type: 'SUBSCRIBE_PLAYER',
            playerId,
            timestamp: Date.now()
        };

        this.sendMessage(message);
        this.subscribedPlayers.add(playerId);
        
        console.log(`Subscribed to player ${playerId} updates for game ${this.config.gameId}`);
    }

    /**
     * Unsubscribe from player updates
     */
    async unsubscribeFromPlayer(playerId: string): Promise<void> {
        if (!this.isConnected || !this.subscribedPlayers.has(playerId)) {
            return;
        }

        const message = {
            type: 'UNSUBSCRIBE_PLAYER',
            playerId,
            timestamp: Date.now()
        };

        this.sendMessage(message);
        this.subscribedPlayers.delete(playerId);
        
        console.log(`Unsubscribed from player ${playerId} updates for game ${this.config.gameId}`);
    }

    /**
     * Send a message to the game WebSocket
     */
    private sendMessage(message: any): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not ready for sending messages');
        }

        this.ws.send(JSON.stringify(message));
    }

    /**
     * Check if the client is connected
     */
    isClientConnected(): boolean {
        return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Get connection status information
     */
    getConnectionStatus(): {
        connected: boolean;
        gameId: string;
        subscribedPlayers: number;
        reconnectAttempts: number;
    } {
        return {
            connected: this.isConnected,
            gameId: this.config.gameId,
            subscribedPlayers: this.subscribedPlayers.size,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    // Private methods

    private handleConnection(): void {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        console.log(`Connected to ${this.config.gameId} WebSocket`);
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Re-subscribe to players if reconnecting
        if (this.subscribedPlayers.size > 0) {
            for (const playerId of this.subscribedPlayers) {
                this.subscribeToPlayer(playerId).catch(console.error);
            }
        }

        this.emit('connected');
    }

    private handleDisconnection(code: number, reason: string): void {
        this.isConnected = false;
        
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        console.log(`Disconnected from ${this.config.gameId} WebSocket: ${code} - ${reason}`);
        
        this.emit('disconnected', { code, reason });

        // Attempt reconnection if not intentionally closed
        if (code !== 1000 && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }

    private handleMessage(data: WebSocket.Data): void {
        try {
            const message: GameWebSocketMessage = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'PLAYER_UPDATE':
                    this.handlePlayerUpdate(message);
                    break;
                    
                case 'ASSET_CHANGE':
                    this.handleAssetChange(message);
                    break;
                    
                case 'ACHIEVEMENT_EARNED':
                    this.handleAchievementEarned(message);
                    break;
                    
                case 'HEARTBEAT':
                    // Respond to heartbeat
                    this.sendMessage({ type: 'HEARTBEAT_ACK', timestamp: Date.now() });
                    break;
                    
                case 'ERROR':
                    this.handleGameError(message);
                    break;
                    
                default:
                    console.warn(`Unknown message type from ${this.config.gameId}:`, message.type);
            }
            
        } catch (error) {
            console.error(`Failed to parse message from ${this.config.gameId}:`, error);
        }
    }

    private handlePlayerUpdate(message: GameWebSocketMessage): void {
        if (!message.playerId || !message.data) {
            console.warn('Invalid player update message:', message);
            return;
        }

        this.emit('playerUpdate', {
            playerId: message.playerId,
            gameId: this.config.gameId,
            data: message.data,
            timestamp: message.timestamp
        });
    }

    private handleAssetChange(message: GameWebSocketMessage): void {
        if (!message.playerId || !message.data) {
            console.warn('Invalid asset change message:', message);
            return;
        }

        this.emit('assetChange', {
            playerId: message.playerId,
            gameId: this.config.gameId,
            assetData: message.data,
            timestamp: message.timestamp
        });
    }

    private handleAchievementEarned(message: GameWebSocketMessage): void {
        if (!message.playerId || !message.data) {
            console.warn('Invalid achievement earned message:', message);
            return;
        }

        this.emit('achievementEarned', {
            playerId: message.playerId,
            gameId: this.config.gameId,
            achievement: message.data,
            timestamp: message.timestamp
        });
    }

    private handleGameError(message: GameWebSocketMessage): void {
        const error: GameHubError = {
            code: 'EXTERNAL_SERVICE_ERROR',
            message: `Game ${this.config.gameId} reported error: ${message.data?.message || 'Unknown error'}`,
            details: {
                gameId: this.config.gameId,
                originalError: message.data
            },
            timestamp: message.timestamp
        };

        this.emit('gameError', error);
    }

    private handleError(error: Error): void {
        console.error(`WebSocket error for ${this.config.gameId}:`, error);
        
        const gameError: GameHubError = {
            code: 'NETWORK_ERROR',
            message: `WebSocket connection error for ${this.config.gameId}: ${error.message}`,
            details: {
                gameId: this.config.gameId,
                originalError: error
            },
            timestamp: Date.now()
        };

        this.emit('error', gameError);
    }

    private startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
                this.sendMessage({ type: 'PING', timestamp: Date.now() });
            }
        }, this.config.heartbeatInterval);
    }

    private scheduleReconnect(): void {
        this.reconnectAttempts++;
        const delay = Math.min(
            this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
            30000 // Max 30 seconds
        );

        console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} for ${this.config.gameId} in ${delay}ms`);

        this.reconnectTimer = setTimeout(() => {
            this.connect().catch((error) => {
                console.error(`Reconnect attempt ${this.reconnectAttempts} failed for ${this.config.gameId}:`, error);
            });
        }, delay);
    }

    private async waitForConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Connection timeout for ${this.config.gameId}`));
            }, this.config.messageTimeout);

            const onConnect = () => {
                clearTimeout(timeout);
                this.off('error', onError);
                resolve();
            };

            const onError = (error: Error) => {
                clearTimeout(timeout);
                this.off('connected', onConnect);
                reject(error);
            };

            this.once('connected', onConnect);
            this.once('error', onError);
        });
    }
}