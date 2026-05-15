/**
 * useConnection - Manages WebSocket connection lifecycle
 *
 * Extracted from useGameWebSocket to isolate connection management
 * (connect/disconnect/reconnect) from game event handling.
 */

import { useRef, useState, useCallback } from "react";
import {
  createGamesWebSocket,
  GamesWebSocket,
} from "@/websocket/games-websocket";
import type { GamesWebSocketConfig } from "@/websocket/games-websocket";
import { useGameStore } from "@/store/game-store";

interface UseConnectionOptions {
  token?: string;
  enabled?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onConnectError?: (error: Error) => void;
  onReconnecting?: (attempt: number) => void;
}

export function useConnection(options: UseConnectionOptions) {
  const {
    token,
    enabled = true,
    onConnect,
    onDisconnect,
    onConnectError,
    onReconnecting,
  } = options;
  const wsRef = useRef<GamesWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const setStoreConnectionStatus = useGameStore((s) => s.setConnectionStatus);
  const setStoreConnected = useGameStore((s) => s.setConnected);

  const connect = useCallback(
    (
      eventConfig: Omit<
        GamesWebSocketConfig,
        | "token"
        | "onConnect"
        | "onDisconnect"
        | "onConnectError"
        | "onReconnecting"
      > = {},
    ) => {
      if (!enabled || wsRef.current?.isConnected) return;

      setConnectionStatus("connecting");
      setStoreConnectionStatus("connecting");

      wsRef.current = createGamesWebSocket({
        token,
        onConnect: () => {
          setIsConnected(true);
          setStoreConnected(true);
          setConnectionStatus("connected");
          setStoreConnectionStatus("connected");
          setReconnectAttempt(0);
          onConnect?.();
        },
        onDisconnect: () => {
          setIsConnected(false);
          setStoreConnected(false);
          setConnectionStatus("disconnected");
          setStoreConnectionStatus("disconnected");
          onDisconnect?.();
        },
        onConnectError: (error) => {
          setConnectionStatus("error");
          setStoreConnectionStatus("error");
          onConnectError?.(error);
        },
        onReconnecting: (attempt) => {
          setReconnectAttempt(attempt);
          setConnectionStatus("connecting");
          setStoreConnectionStatus("connecting");
          onReconnecting?.(attempt);
        },
        ...eventConfig,
      });

      wsRef.current.connect();
    },
    [
      enabled,
      token,
      setStoreConnectionStatus,
      setStoreConnected,
      onConnect,
      onDisconnect,
      onConnectError,
      onReconnecting,
    ],
  );

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    setIsConnected(false);
    setStoreConnected(false);
    setConnectionStatus("disconnected");
    setStoreConnectionStatus("disconnected");
  }, [setStoreConnected, setStoreConnectionStatus]);

  return {
    wsRef,
    isConnected,
    connectionStatus,
    reconnectAttempt,
    connect,
    disconnect,
  };
}
