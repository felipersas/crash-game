/**
 * useGameWebSocket - Custom hook for WebSocket connection
 *
 * This hook manages the WebSocket connection and updates the Zustand store
 * with real-time game state. Components should read from useGameStore
 * to get the latest game state.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createGamesWebSocket,
  GamesWebSocket,
} from "../infrastructure/websocket/games-websocket";
import { createGamesApi } from "../infrastructure/api/games-api";
import { RoundStatus, type Round } from "../domain/types/game.types";
import { useGameStore } from "../infrastructure/store/game-store";

export interface UseGameWebSocketOptions {
  token?: string;
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
  const { token, enabled = true } = options;
  const wsRef = useRef<GamesWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Zustand store actions
  const setStoreConnectionStatus = useGameStore(
    (state) => state.setConnectionStatus,
  );
  const setStoreConnected = useGameStore((state) => state.setConnected);
  const setStoreRoundStarted = useGameStore((state) => state.setRoundStarted);
  const setStoreBettingEnded = useGameStore((state) => state.setBettingEnded);
  const setStoreMultiplier = useGameStore((state) => state.setMultiplier);
  const setStoreCrash = useGameStore((state) => state.setCrash);
  const setStoreCurrentBets = useGameStore((state) => state.setCurrentBets);

  // Use ref to avoid stale closures in event handlers
  const currentRoundIdRef = useRef<string | null>(null);

  // Fetch current round on connect to sync state with store
  const syncCurrentRound = useCallback(
    async (accessToken: string | undefined) => {
      try {
        const api = createGamesApi(accessToken);
        const round: Round = await api.getCurrentRound();

        // Sync store with current round
        currentRoundIdRef.current = round.roundId;

        // Set phase and multiplier based on round status
        switch (round.status) {
          case RoundStatus.BETTING:
            setStoreRoundStarted(
              round.roundId,
              round.seedHash || "",
              round.bettingEndTime
                ? new Date(round.bettingEndTime)
                : new Date(Date.now() + 10000),
            );
            setStoreCurrentBets(round.bets || []);
            break;
          case RoundStatus.ACTIVE:
            setStoreRoundStarted(
              round.roundId,
              round.seedHash || "",
              new Date(),
            );
            setStoreBettingEnded();
            setStoreMultiplier(round.currentMultiplier ?? 1.0);
            setStoreCurrentBets(round.bets || []);
            break;
          case RoundStatus.CRASHED:
            setStoreRoundStarted(
              round.roundId,
              round.seedHash || "",
              new Date(),
            );
            setStoreCrash(round.crashPoint ?? 1.0);
            setStoreCurrentBets(round.bets || []);
            break;
        }
      } catch (error) {
        console.error("Failed to sync current round:", error);
      }
    },
    [
      setStoreRoundStarted,
      setStoreBettingEnded,
      setStoreMultiplier,
      setStoreCrash,
      setStoreCurrentBets,
    ],
  );

  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.isConnected) return;

    setConnectionStatus("connecting");
    setStoreConnectionStatus("connecting");

    wsRef.current = createGamesWebSocket({
      token,
      // Connection state callbacks
      onConnect: () => {
        setIsConnected(true);
        setStoreConnected(true);
        setConnectionStatus("connected");
        setStoreConnectionStatus("connected");
        setReconnectAttempt(0);
        // Sync current round state on connect
        syncCurrentRound(token);
      },
      onDisconnect: () => {
        setIsConnected(false);
        setStoreConnected(false);
        setConnectionStatus("disconnected");
        setStoreConnectionStatus("disconnected");
      },
      onConnectError: () => {
        setConnectionStatus("error");
        setStoreConnectionStatus("error");
      },
      onReconnecting: (attempt) => {
        setReconnectAttempt(attempt);
      },
      // Game event callbacks - update Zustand store
      onRoundStarted: (data) => {
        currentRoundIdRef.current = data.roundId;
        setStoreRoundStarted(
          data.roundId,
          data.seedHash,
          new Date(data.bettingEndTime),
        );
      },
      onBettingEnded: (data) => {
        // Only update if for current round
        if (data.roundId === currentRoundIdRef.current) {
          setStoreBettingEnded();
        }
      },
      onMultiplierUpdate: (data) => {
        // Only update if for current round
        if (data.roundId === currentRoundIdRef.current) {
          setStoreMultiplier(data.multiplier);
        }
      },
      onCrash: (data) => {
        // Only update if for current round
        if (data.roundId === currentRoundIdRef.current) {
          setStoreCrash(data.crashPoint);
        }
      },
      onBetPlaced: async (data) => {
        // Refetch round data to get updated bets list
        // Note: Backend should include betId in future for proper real-time updates
        if (data.roundId === currentRoundIdRef.current) {
          try {
            const api = createGamesApi(token);
            const round = await api.getCurrentRound();
            if (round.roundId === data.roundId) {
              setStoreCurrentBets(round.bets || []);
            }
          } catch (error) {
            console.error("Failed to refetch bets after bet placed:", error);
          }
        }
      },
      onPlayerCashedOut: async (data) => {
        // Refetch round data to get updated bets list
        if (data.roundId === currentRoundIdRef.current) {
          try {
            const api = createGamesApi(token);
            const round = await api.getCurrentRound();
            if (round.roundId === data.roundId) {
              setStoreCurrentBets(round.bets || []);
            }
          } catch (error) {
            console.error("Failed to refetch bets after cash out:", error);
          }
        }
      },
    });

    wsRef.current.connect();
  }, [
    enabled,
    token,
    syncCurrentRound,
    setStoreConnectionStatus,
    setStoreConnected,
    setStoreRoundStarted,
    setStoreBettingEnded,
    setStoreMultiplier,
    setStoreCrash,
    setStoreCurrentBets,
  ]);

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    setIsConnected(false);
    setStoreConnected(false);
    setConnectionStatus("disconnected");
    setStoreConnectionStatus("disconnected");
  }, [setStoreConnected, setStoreConnectionStatus]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected,
    connectionStatus,
    reconnectAttempt,
    connect,
    disconnect,
  };
}
