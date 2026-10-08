/**
 * useConnection - Manages the WebSocket connection lifecycle
 *
 * Owns a single GamesWebSocket instance. Connection status is written to the
 * game store (single source of truth) so any component can read it.
 */

import { useRef, useState, useCallback } from "react";
import {
  createGamesWebSocket,
  type GamesWebSocket,
  type GameEventHandlers,
} from "@/websocket/games-websocket";
import type { ConnectionStatus } from "@/websocket/websocket.types";
import { useGameStore } from "@/store/game-store";

export interface ConnectOptions {
  token?: string;
  handlers: GameEventHandlers;
  onConnect?: () => void;
}

export function useConnection() {
  const wsRef = useRef<GamesWebSocket | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const connectionStatus = useGameStore((s) => s.connectionStatus);
  const isConnected = useGameStore((s) => s.isConnected);
  const setStoreConnectionStatus = useGameStore((s) => s.setConnectionStatus);
  const setStoreConnected = useGameStore((s) => s.setConnected);

  const updateStatus = useCallback(
    (status: ConnectionStatus) => {
      setStoreConnectionStatus(status);
      setStoreConnected(status === "connected");
    },
    [setStoreConnectionStatus, setStoreConnected],
  );

  const connect = useCallback(
    ({ token, handlers, onConnect }: ConnectOptions) => {
      // Guard on the instance, not on `connected`: a socket that is still
      // handshaking must not be replaced (that would leak it).
      if (wsRef.current) return;

      updateStatus("connecting");

      const ws = createGamesWebSocket({
        ...handlers,
        token,
        onConnect: () => {
          setReconnectAttempt(0);
          updateStatus("connected");
          onConnect?.();
        },
        onDisconnect: () => updateStatus("disconnected"),
        onConnectError: () => updateStatus("error"),
        onReconnecting: (attempt) => {
          setReconnectAttempt(attempt);
          updateStatus("connecting");
        },
      });

      wsRef.current = ws;
      ws.connect();
    },
    [updateStatus],
  );

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current = null;
    updateStatus("disconnected");
  }, [updateStatus]);

  return {
    isConnected,
    connectionStatus,
    reconnectAttempt,
    connect,
    disconnect,
  };
}
