/**
 * useGameWebSocket - Orchestrator hook for WebSocket game connection
 *
 * Composes three focused hooks:
 * - useConnection: manages WS connection lifecycle (connect/disconnect/reconnect)
 * - useRoundSync: syncs current round state via REST on connect
 * - useGameEvents: creates event handler functions for game events
 *
 * The connection is (re)opened whenever `enabled`, `token` or `playerId`
 * change, so handlers never run with a stale identity.
 */

import { useCallback, useEffect, useRef } from "react";
import { useConnection } from "./useConnection";
import { useRoundSync } from "./useRoundSync";
import { useGameEvents } from "./useGameEvents";
import type { ConnectionStatus } from "@/websocket/websocket.types";

export interface UseGameWebSocketOptions {
  token?: string;
  playerId?: string;
  /** Connect only once the auth session is resolved. */
  enabled?: boolean;
}

export interface UseGameWebSocketReturn {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
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
    useConnection();

  const open = useCallback(() => {
    connect({
      token,
      handlers: createEventHandlers(currentRoundIdRef),
      onConnect: () => {
        void syncCurrentRound(currentRoundIdRef);
      },
    });
  }, [connect, token, createEventHandlers, syncCurrentRound]);

  useEffect(() => {
    if (!enabled) return;
    open();
    return disconnect;
  }, [enabled, open, disconnect]);

  return { isConnected, connectionStatus, reconnectAttempt, connect: open, disconnect };
}
