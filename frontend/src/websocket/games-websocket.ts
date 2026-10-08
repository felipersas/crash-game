/**
 * Games WebSocket Client (Socket.IO wrapper)
 */

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents } from './websocket.types';

// Connect through Kong to games service
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const MAX_RECONNECT_ATTEMPTS = 20;

type EventPayload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];

/** Game event callbacks (server → client push). */
export interface GameEventHandlers {
  onRoundStarted?: (data: EventPayload<'roundStarted'>) => void;
  onBettingEnded?: (data: EventPayload<'bettingEnded'>) => void;
  onMultiplierUpdate?: (data: EventPayload<'multiplierUpdate'>) => void;
  onCrash?: (data: EventPayload<'crash'>) => void;
  onBetPlaced?: (data: EventPayload<'betPlaced'>) => void;
  onBetConfirmed?: (data: EventPayload<'betConfirmed'>) => void;
  onBetCancelled?: (data: EventPayload<'betCancelled'>) => void;
  onPlayerCashedOut?: (data: EventPayload<'playerCashedOut'>) => void;
}

/** Connection lifecycle callbacks. */
export interface ConnectionHandlers {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onConnectError?: (error: Error) => void;
  onReconnecting?: (attempt: number) => void;
}

export interface GamesWebSocketConfig extends GameEventHandlers, ConnectionHandlers {
  token?: string;
}

/**
 * Games WebSocket Client class
 */
export class GamesWebSocket {
  private socket: Socket<ServerToClientEvents> | null = null;

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
      path: '/socket.io/',
      auth,
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: INITIAL_RECONNECT_DELAY,
      reconnectionDelayMax: MAX_RECONNECT_DELAY,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event listeners
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.config.onConnect?.();
    });

    this.socket.on('disconnect', (reason) => {
      this.config.onDisconnect?.(reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.config.onConnectError?.(error);
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.config.onReconnecting?.(attempt);
    });

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

    this.socket.on('betConfirmed', (data) => {
      this.config.onBetConfirmed?.(data);
    });

    this.socket.on('betCancelled', (data) => {
      this.config.onBetCancelled?.(data);
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
}

export function createGamesWebSocket(config: GamesWebSocketConfig): GamesWebSocket {
  return new GamesWebSocket(config);
}
