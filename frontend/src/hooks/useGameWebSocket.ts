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
} from "../websocket/games-websocket";
import { getCurrentRound } from "@/libs/games-api";
import { useGameSounds } from "@/hooks/useGameSounds";
import {
  RoundStatus,
  BetStatus,
  type Bet,
  type Round,
} from "@/types/game.types";
import { useGameStore } from "@/store/game-store";
import { toast } from "sonner";
import { formatMoney } from "@/domain/money";

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
  const wsRef = useRef<GamesWebSocket | null>(null);
  const { playCrash } = useGameSounds();
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
  const setStoreHydrated = useGameStore((state) => state.setHydrated);
  const setStoreRoundStarted = useGameStore((state) => state.setRoundStarted);
  const setStoreRejoinActiveRound = useGameStore((state) => state.rejoinActiveRound);
  const setStoreBettingEnded = useGameStore((state) => state.setBettingEnded);
  const setStoreMultiplier = useGameStore((state) => state.setMultiplier);
  const setStoreCrash = useGameStore((state) => state.setCrash);
  const setStoreCurrentBets = useGameStore((state) => state.setCurrentBets);
  const setStoreMyActiveBet = useGameStore((state) => state.setMyActiveBet);
  const storeAddBet = useGameStore((state) => state.addBet);
  const storeUpdateBet = useGameStore((state) => state.updateBet);

  // Use ref to avoid stale closures in event handlers
  const currentRoundIdRef = useRef<string | null>(null);

  // Fetch current round on connect to sync state with store
  const syncCurrentRound = useCallback(
    async () => {
      try {
        const round: Round = await getCurrentRound();

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
            setStoreRejoinActiveRound(
              round.roundId,
              round.seedHash || "",
              round.startedAt ? new Date(round.startedAt) : new Date(),
              round.currentMultiplier ?? 1.0,
              round.bets || [],
            );
            break;
          case RoundStatus.CRASHED:
            setStoreRoundStarted(
              round.roundId,
              round.seedHash || "",
              new Date(),
              round.startedAt ? new Date(round.startedAt) : null,
            );
            setStoreCrash(round.crashPoint ?? 1.0);
            setStoreCurrentBets(round.bets || []);
            break;
        }

        if (playerId && round.bets?.length) {
          const myBet = round.bets.find(
            (b) =>
              b.playerId === playerId &&
              b.status !== "LOST" &&
              b.status !== "CANCELLED",
          );
          if (myBet) {
            setStoreMyActiveBet(myBet);
          }
        }
      } catch (error) {
        console.error("Failed to sync current round:", error);
      } finally {
        setStoreHydrated();
      }
    },
    [
      setStoreRoundStarted,
      setStoreRejoinActiveRound,
      setStoreBettingEnded,
      setStoreMultiplier,
      setStoreCrash,
      setStoreCurrentBets,
      setStoreMyActiveBet,
      playerId,
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
        syncCurrentRound();
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
        setConnectionStatus("connecting");
        setStoreConnectionStatus("connecting");
      },
      // Game event callbacks - update Zustand store
      onRoundStarted: (data) => {
        currentRoundIdRef.current = data.roundId;
        setStoreRoundStarted(
          data.roundId,
          data.seedHash,
          new Date(data.bettingEndTime),
        );
        setStoreCurrentBets([]);
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
          // Play crash sound immediately if player has an active losing bet
          const state = useGameStore.getState();
          if (state.myActiveBet && state.myActiveBet.status !== "CASHED_OUT") {
            playCrash();
          }
        }
      },
      onBetPlaced: (data) => {
        if (
          currentRoundIdRef.current &&
          data.roundId !== currentRoundIdRef.current
        )
          return;
        const bet: Bet = {
          id: data.betId,
          roundId: data.roundId,
          playerId: data.playerId,
          playerName: data.playerName ?? '',
          amountCents: data.amountCents,
          amountDecimal: (data.amountCents / 100).toFixed(2),
          status: BetStatus.PENDING,
          cashOutMultiplier: null,
          payoutCents: null,
          payoutDecimal: null,
          cashedOutAt: null,
        };
        storeAddBet(bet);
      },
      onPlayerCashedOut: (data) => {
        if (
          currentRoundIdRef.current &&
          data.roundId !== currentRoundIdRef.current
        )
          return;
        storeUpdateBet(data.betId, {
          status: BetStatus.CASHED_OUT,
          cashOutMultiplier: data.multiplier,
          payoutCents: data.payoutCents,
          payoutDecimal: (data.payoutCents / 100).toFixed(2),
          cashedOutAt: new Date(),
        });
      },
      onBetConfirmed: (data) => {
        if (
          currentRoundIdRef.current &&
          data.roundId !== currentRoundIdRef.current
        )
          return;
        storeUpdateBet(data.betId, { status: BetStatus.ACTIVE });
        // Update myActiveBet if it's our bet
        if (data.playerId === playerId) {
          const myBet = useGameStore.getState().myActiveBet;
          if (myBet?.id === data.betId) {
            useGameStore.getState().updateBetStatus(data.betId, BetStatus.ACTIVE);
          }
          toast.success("Bet Confirmed!", {
            description: `${formatMoney(data.amountCents)} is now active`,
            duration: 3000,
          });
        }
      },
      onBetCancelled: (data) => {
        if (
          currentRoundIdRef.current &&
          data.roundId !== currentRoundIdRef.current
        )
          return;
        storeUpdateBet(data.betId, { status: BetStatus.CANCELLED });
        // Clear myActiveBet if it's our bet
        if (data.playerId === playerId) {
          const myBet = useGameStore.getState().myActiveBet;
          if (myBet?.id === data.betId) {
            setStoreMyActiveBet(null);
          }
          toast.error("Bet Cancelled", {
            description: data.reason,
            duration: 4000,
          });
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
    storeAddBet,
    storeUpdateBet,
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
