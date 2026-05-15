/**
 * useGameWebSocket - Orchestrator hook for WebSocket game connection
 *
 * Composes three focused hooks:
 * - useConnection: manages WS connection lifecycle (connect/disconnect/reconnect)
 * - useRoundSync: syncs current round state via REST on connect
 * - useGameEvents: creates event handler functions for game events
 */

import { useEffect, useRef, useCallback } from "react";
import { useConnection } from "./useConnection";
import { useRoundSync } from "./useRoundSync";
import { useGameEvents } from "./useGameEvents";

export interface UseGameWebSocketOptions {
  token?: string;
  playerId?: string;
  enabled?: boolean;
}

export interface UseGameWebSocketReturn {
  isConnected: boolean;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  reconnectAttempt: number;
  connect: () => void;
  disconnect: () => void;
}

export function useGameWebSocket(
  options: UseGameWebSocketOptions = {},
): UseGameWebSocketReturn {
  const { token, playerId, enabled = true } = options;
  const currentRoundIdRef = useRef<string | null>(null);

  const syncCurrentRound = useRoundSync(playerId);
  const createEventHandlers = useGameEvents(playerId);

  const { isConnected, connectionStatus, reconnectAttempt, connect, disconnect } =
    useConnection({
      token,
      enabled,
      onConnect: () => {
        syncCurrentRound(currentRoundIdRef);
      },
    });

  const connectWithEvents = useCallback(() => {
    const eventHandlers = createEventHandlers(currentRoundIdRef);
    connect(eventHandlers);
  }, [connect, createEventHandlers]);

  useEffect(() => {
    if (!enabled) return;

    const eventHandlers = createEventHandlers(currentRoundIdRef);
    connect(eventHandlers);
    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect, createEventHandlers]);

  return {
    isConnected,
    connectionStatus,
    reconnectAttempt,
    connect: connectWithEvents,
    disconnect,
  };
}
