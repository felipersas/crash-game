/**
 * useGameWebSocket - Custom hook for WebSocket connection
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createGamesWebSocket, GamesWebSocket } from '../infrastructure/websocket/games-websocket';
import { RoundStatus } from '../domain/types/game.types';

export interface UseGameWebSocketOptions {
  token?: string;
  enabled?: boolean;
}

export interface UseGameWebSocketReturn {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  currentRoundId: string | null;
  liveMultiplier: number;
  roundPhase: 'betting' | 'active' | 'crashed';
  bettingEndTime: Date | null;
  connect: () => void;
  disconnect: () => void;
}

export function useGameWebSocket(options: UseGameWebSocketOptions = {}): UseGameWebSocketReturn {
  const { token, enabled = true } = options;
  const wsRef = useRef<GamesWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [liveMultiplier, setLiveMultiplier] = useState(1.0);
  const [roundPhase, setRoundPhase] = useState<'betting' | 'active' | 'crashed'>('betting');
  const [bettingEndTime, setBettingEndTime] = useState<Date | null>(null);

  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.isConnected) return;
    
    setConnectionStatus('connecting');
    
    wsRef.current = createGamesWebSocket({
      token,
      onRoundStarted: (data) => {
        setCurrentRoundId(data.roundId);
        setRoundPhase('betting');
        setLiveMultiplier(1.0);
        setBettingEndTime(new Date(data.bettingEndTime));
      },
      onBettingEnded: () => {
        setRoundPhase('active');
        setBettingEndTime(null);
      },
      onMultiplierUpdate: (data) => {
        if (data.roundId === currentRoundId) {
          setLiveMultiplier(data.multiplier);
        }
      },
      onCrash: (data) => {
        if (data.roundId === currentRoundId) {
          setLiveMultiplier(data.crashPoint);
          setRoundPhase('crashed');
        }
      },
      onBetPlaced: () => {
        // Trigger refetch of current round
      },
      onPlayerCashedOut: () => {
        // Trigger refetch of current round
      },
    });

    wsRef.current.connect();
  }, [enabled, token, currentRoundId]);

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled]);

  return {
    isConnected,
    connectionStatus,
    currentRoundId,
    liveMultiplier,
    roundPhase,
    bettingEndTime,
    connect,
    disconnect,
  };
}
