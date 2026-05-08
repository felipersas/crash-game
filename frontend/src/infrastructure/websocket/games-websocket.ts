/**
 * Games WebSocket Client (Socket.IO wrapper)
 */

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents } from './websocket.types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000/games';

export interface GamesWebSocketConfig {
  token?: string;
  onRoundStarted?: (data: Parameters<ServerToClientEvents['roundStarted']>[0]) => void;
  onBettingEnded?: (data: Parameters<ServerToClientEvents['bettingEnded']>[0]) => void;
  onMultiplierUpdate?: (data: Parameters<ServerToClientEvents['multiplierUpdate']>[0]) => void;
  onCrash?: (data: Parameters<ServerToClientEvents['crash']>[0]) => void;
  onBetPlaced?: (data: Parameters<ServerToClientEvents['betPlaced']>[0]) => void;
  onPlayerCashedOut?: (data: Parameters<ServerToClientEvents['playerCashedOut']>[0]) => void;
}

/**
 * Games WebSocket Client class
 */
export class GamesWebSocket {
  private socket: Socket<ServerToClientEvents> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;

  constructor(private config: GamesWebSocketConfig) {}

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const auth = this.config.token
      ? { token: this.config.token }
      : undefined;

    this.socket = io(WS_URL, {
      path: '/games/socket.io/',
      auth,
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event listeners
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
    });

    // Game events
    this.socket.on('roundStarted', (data) => {
      this.config.onRoundStarted?.(data);
    });

    this.socket.on('bettingEnded', (data) => {
      this.config.onBettingEnded?.(data);
    });

    this.socket.on('multiplierUpdate', (data) => {
      this.config.onMultiplierUpdate?.(data);
    });

    this.socket.on('crash', (data) => {
      this.config.onCrash?.(data);
    });

    this.socket.on('betPlaced', (data) => {
      this.config.onBetPlaced?.(data);
    });

    this.socket.on('playerCashedOut', (data) => {
      this.config.onPlayerCashedOut?.(data);
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /**
   * Get connection status
   */
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get socket ID
   */
  get id(): string | undefined {
    return this.socket?.id;
  }
}

/**
 * Factory function to create WebSocket client
 */
export function createGamesWebSocket(config: GamesWebSocketConfig): GamesWebSocket {
  return new GamesWebSocket(config);
}
