/**
 * useGameWebSocket - Orchestrator hook for WebSocket game connection
 *
 * Composes three focused hooks:
 * - useConnection: manages WS connection lifecycle (connect/disconnect/reconnect)
 * - useRoundSync: syncs current round state via REST on connect
 * - useGameEvents: creates event handler functions for game events
 */

import { useEffect, useRef } from "react";
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

  // Hold latest functions in refs so the effect only re-runs on `enabled` changes
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;
  const createEventHandlersRef = useRef(createEventHandlers);
  createEventHandlersRef.current = createEventHandlers;

  useEffect(() => {
    if (!enabled) return;

    const eventHandlers = createEventHandlersRef.current(currentRoundIdRef);
    connectRef.current(eventHandlers);

    return () => {
      disconnectRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { isConnected, connectionStatus, reconnectAttempt, connect: () => connectRef.current(createEventHandlersRef.current(currentRoundIdRef)), disconnect };
}
