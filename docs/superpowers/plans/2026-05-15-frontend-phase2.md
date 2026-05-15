# Frontend Phase 2 — Hook Refactor, API Validation, Auth Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the 324-line `useGameWebSocket` into focused hooks, add Zod runtime validation on API responses, and fix auth error handling.

**Architecture:** Extract connection lifecycle, round sync, and event handling into separate concerns. Validate API responses at the boundary. Handle auth edge cases properly.

**Tech Stack:** React 19, Zustand 5, Socket.IO, Zod 4, NextAuth 4

---

## File Structure

### New Files
- `frontend/src/hooks/useConnection.ts` — WS connection lifecycle (connect/disconnect/reconnect state)
- `frontend/src/hooks/useRoundSync.ts` — REST round sync on connect
- `frontend/src/hooks/useGameEvents.ts` — WS event → Zustand store dispatchers

### Modified Files
- `frontend/src/hooks/useGameWebSocket.ts` — Simplified orchestrator composing the 3 hooks
- `frontend/src/libs/games-api.ts` — Add Zod validation on responses
- `frontend/src/libs/wallets-api.ts` — Add Zod validation on responses
- `frontend/src/hooks/useAuth.ts` — Fix logout error handling
- `frontend/src/libs/auth.ts` — Handle refresh token failure with session invalidation

---

### Task 1: Extract useConnection hook

**Files:**
- Create: `frontend/src/hooks/useConnection.ts`

Extract the connection lifecycle from `useGameWebSocket.ts` (lines 44-50, 142-305). This hook manages:
- `wsRef`, `isConnected`, `connectionStatus`, `reconnectAttempt` state
- `connect()` — creates WebSocket instance with callbacks
- `disconnect()` — tears down connection
- Syncs connection state to Zustand store

```typescript
// frontend/src/hooks/useConnection.ts
import { useRef, useState, useCallback } from "react";
import { createGamesWebSocket, GamesWebSocket } from "@/websocket/games-websocket";
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
  const { token, enabled = true, onConnect, onDisconnect, onConnectError, onReconnecting } = options;
  const wsRef = useRef<GamesWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const setStoreConnectionStatus = useGameStore((s) => s.setConnectionStatus);
  const setStoreConnected = useGameStore((s) => s.setConnected);

  const connect = useCallback((eventConfig: Omit<GamesWebSocketConfig, 'token' | 'onConnect' | 'onDisconnect' | 'onConnectError' | 'onReconnecting'> = {}) => {
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
  }, [enabled, token, setStoreConnectionStatus, setStoreConnected, onConnect, onDisconnect, onConnectError, onReconnecting]);

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    setIsConnected(false);
    setStoreConnected(false);
    setConnectionStatus("disconnected");
    setStoreConnectionStatus("disconnected");
  }, [setStoreConnected, setStoreConnectionStatus]);

  return { wsRef, isConnected, connectionStatus, reconnectAttempt, connect, disconnect };
}
```

- [ ] **Step 1: Create the file**
- [ ] **Step 2: Run tests:** `cd frontend && bun vitest run`
- [ ] **Step 3: Commit:** `git add src/hooks/useConnection.ts && git commit -m "refactor: extract connection lifecycle into useConnection hook"`

---

### Task 2: Extract useRoundSync hook

**Files:**
- Create: `frontend/src/hooks/useRoundSync.ts`

Extract the `syncCurrentRound` logic from `useGameWebSocket.ts` (lines 72-140).

```typescript
// frontend/src/hooks/useRoundSync.ts
import { useCallback } from "react";
import { getCurrentRound } from "@/libs/games-api";
import { RoundStatus, type Bet, type Round } from "@/types/game.types";
import { useGameStore } from "@/store/game-store";

export function useRoundSync(playerId?: string) {
  const setStoreRoundStarted = useGameStore((s) => s.setRoundStarted);
  const setStoreRejoinActiveRound = useGameStore((s) => s.rejoinActiveRound);
  const setStoreCrash = useGameStore((s) => s.setCrash);
  const setStoreCurrentBets = useGameStore((s) => s.setCurrentBets);
  const setStoreMyActiveBet = useGameStore((s) => s.setMyActiveBet);
  const setStoreHydrated = useGameStore((s) => s.setHydrated);

  return useCallback(async (currentRoundIdRef: React.MutableRefObject<string | null>) => {
    try {
      const round: Round = await getCurrentRound();
      currentRoundIdRef.current = round.roundId;

      switch (round.status) {
        case RoundStatus.BETTING:
          setStoreRoundStarted(
            round.roundId,
            round.seedHash || "",
            round.bettingEndTime ? new Date(round.bettingEndTime) : new Date(Date.now() + 10000),
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
          (b) => b.playerId === playerId && b.status !== "LOST" && b.status !== "CANCELLED",
        );
        if (myBet) setStoreMyActiveBet(myBet);
      }
    } catch (error) {
      console.error("Failed to sync current round:", error);
    } finally {
      setStoreHydrated();
    }
  }, [setStoreRoundStarted, setStoreRejoinActiveRound, setStoreCrash, setStoreCurrentBets, setStoreMyActiveBet, setStoreHydrated, playerId]);
}
```

- [ ] **Step 1: Create the file**
- [ ] **Step 2: Run tests:** `cd frontend && bun vitest run`
- [ ] **Step 3: Commit:** `git add src/hooks/useRoundSync.ts && git commit -m "refactor: extract round sync into useRoundSync hook"`

---

### Task 3: Extract useGameEvents hook

**Files:**
- Create: `frontend/src/hooks/useGameEvents.ts`

Extract the game event handlers from `useGameWebSocket.ts` (lines 176-280). This hook creates event handler functions that can be passed to the WebSocket config.

```typescript
// frontend/src/hooks/useGameEvents.ts
import { useCallback, useRef } from "react";
import { BetStatus, type Bet } from "@/types/game.types";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { toast } from "sonner";
import { formatMoney } from "@/domain/money";

export function useGameEvents(playerId?: string) {
  const setStoreRoundStarted = useGameStore((s) => s.setRoundStarted);
  const setStoreBettingEnded = useGameStore((s) => s.setBettingEnded);
  const setStoreMultiplier = useGameStore((s) => s.setMultiplier);
  const setStoreCrash = useGameStore((s) => s.setCrash);
  const setStoreCurrentBets = useGameStore((s) => s.setCurrentBets);
  const setStoreMyActiveBet = useGameStore((s) => s.setMyActiveBet);
  const storeAddBet = useGameStore((s) => s.addBet);
  const storeUpdateBet = useGameStore((s) => s.updateBet);
  const { playCrash } = useGameSounds();

  return useCallback((currentRoundIdRef: React.MutableRefObject<string | null>) => ({
    onRoundStarted: (data: { roundId: string; seedHash: string; bettingEndTime: Date | string }) => {
      currentRoundIdRef.current = data.roundId;
      setStoreRoundStarted(data.roundId, data.seedHash, new Date(data.bettingEndTime));
      setStoreCurrentBets([]);
    },
    onBettingEnded: (data: { roundId: string }) => {
      if (data.roundId === currentRoundIdRef.current) setStoreBettingEnded();
    },
    onMultiplierUpdate: (data: { roundId: string; multiplier: number }) => {
      if (data.roundId === currentRoundIdRef.current) setStoreMultiplier(data.multiplier);
    },
    onCrash: (data: { roundId: string; crashPoint: number }) => {
      if (data.roundId === currentRoundIdRef.current) {
        setStoreCrash(data.crashPoint);
        const state = useGameStore.getState();
        if (state.myActiveBet && state.myActiveBet.status !== "CASHED_OUT") playCrash();
      }
    },
    onBetPlaced: (data: { roundId: string; betId: string; playerId: string; playerName: string; amountCents: number }) => {
      if (currentRoundIdRef.current && data.roundId !== currentRoundIdRef.current) return;
      const bet: Bet = {
        id: data.betId, roundId: data.roundId, playerId: data.playerId,
        playerName: data.playerName ?? '', amountCents: data.amountCents,
        amountDecimal: (data.amountCents / 100).toFixed(2), status: BetStatus.PENDING,
        cashOutMultiplier: null, payoutCents: null, payoutDecimal: null, cashedOutAt: null,
      };
      storeAddBet(bet);
    },
    onPlayerCashedOut: (data: { roundId: string; betId: string; multiplier: number; payoutCents: number }) => {
      if (currentRoundIdRef.current && data.roundId !== currentRoundIdRef.current) return;
      storeUpdateBet(data.betId, {
        status: BetStatus.CASHED_OUT, cashOutMultiplier: data.multiplier,
        payoutCents: data.payoutCents, payoutDecimal: (data.payoutCents / 100).toFixed(2),
        cashedOutAt: new Date(),
      });
    },
    onBetConfirmed: (data: { roundId: string; betId: string; playerId: string; amountCents: number }) => {
      if (currentRoundIdRef.current && data.roundId !== currentRoundIdRef.current) return;
      storeUpdateBet(data.betId, { status: BetStatus.ACTIVE });
      if (data.playerId === playerId) {
        const myBet = useGameStore.getState().myActiveBet;
        if (myBet?.id === data.betId) useGameStore.getState().updateBetStatus(data.betId, BetStatus.ACTIVE);
        toast.success("Bet Confirmed!", { description: `${formatMoney(data.amountCents)} is now active`, duration: 3000 });
      }
    },
    onBetCancelled: (data: { roundId: string; betId: string; playerId: string; reason: string }) => {
      if (currentRoundIdRef.current && data.roundId !== currentRoundIdRef.current) return;
      storeUpdateBet(data.betId, { status: BetStatus.CANCELLED });
      if (data.playerId === playerId) {
        const myBet = useGameStore.getState().myActiveBet;
        if (myBet?.id === data.betId) setStoreMyActiveBet(null);
        toast.error("Bet Cancelled", { description: data.reason, duration: 4000 });
      }
    },
  }), [
    setStoreRoundStarted, setStoreBettingEnded, setStoreMultiplier, setStoreCrash,
    setStoreCurrentBets, setStoreMyActiveBet, storeAddBet, storeUpdateBet, playCrash, playerId,
  ]);
}
```

- [ ] **Step 1: Create the file**
- [ ] **Step 2: Run tests:** `cd frontend && bun vitest run`
- [ ] **Step 3: Commit:** `git add src/hooks/useGameEvents.ts && git commit -m "refactor: extract game event handlers into useGameEvents hook"`

---

### Task 4: Rewrite useGameWebSocket as orchestrator

**Files:**
- Modify: `frontend/src/hooks/useGameWebSocket.ts`

Replace the 324-line monolith with a thin orchestrator that composes the 3 new hooks:

```typescript
// frontend/src/hooks/useGameWebSocket.ts
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

export function useGameWebSocket(options: UseGameWebSocketOptions = {}): UseGameWebSocketReturn {
  const { token, playerId, enabled = true } = options;
  const currentRoundIdRef = useRef<string | null>(null);

  const syncCurrentRound = useRoundSync(playerId);
  const createEventHandlers = useGameEvents(playerId);

  const { isConnected, connectionStatus, reconnectAttempt, connect, disconnect } = useConnection({
    token,
    enabled,
    onConnect: () => syncCurrentRound(currentRoundIdRef),
  });

  useEffect(() => {
    if (!enabled) return;

    const eventHandlers = createEventHandlers(currentRoundIdRef);

    connect(eventHandlers);
    return () => { disconnect(); };
  }, [enabled, connect, disconnect, createEventHandlers]);

  return { isConnected, connectionStatus, reconnectAttempt, connect: () => connect(), disconnect };
}
```

**IMPORTANT:** Read the actual current `useGameWebSocket.ts` to see the exact current state before modifying. The hook must maintain the same public API (`UseGameWebSocketReturn` interface and function signature).

**Key issue to handle:** The `connect` function now takes event config as parameter. The `useEffect` should pass the event handlers. The returned `connect` should be a no-arg wrapper.

- [ ] **Step 1: Rewrite the file**
- [ ] **Step 2: Run tests:** `cd frontend && bun vitest run`
- [ ] **Step 3: Verify TypeScript:** `cd frontend && bunx tsc --noEmit`
- [ ] **Step 4: Commit:** `git add src/hooks/useGameWebSocket.ts && git commit -m "refactor: simplify useGameWebSocket as orchestrator composing focused hooks"`

---

### Task 5: Add Zod validation to games API

**Files:**
- Modify: `frontend/src/libs/games-api.ts`

Add runtime validation using the existing Zod schemas in `frontend/src/schemas/api-schemas.ts`. The schemas already exist but are only used for type inference. Add a `validate` helper and apply it to each API call.

```typescript
// Add at top of games-api.ts
import { z } from "zod";
import {
  placeBetResponseSchema,
  cashOutResponseSchema,
  getRoundHistoryResponseSchema,
  verifyRoundResponseSchema,
  getMyBetsResponseSchema,
} from "@/schemas/api-schemas";

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}
```

Then wrap each return value. Example for `placeBet`:
```typescript
export function placeBet(amountCents: number): Promise<PlaceBetResponse> {
  return post(API_ENDPOINTS.GAMES.BET, { amount: amountCents }).then(data => validate(placeBetResponseSchema, data));
}
```

Apply the same pattern to: `cashOut`, `getRoundHistory`, `getMyBets`, `verifyRound`.

Note: `getCurrentRound` does NOT have a Zod schema — skip it.

- [ ] **Step 1: Read current games-api.ts**
- [ ] **Step 2: Add validation**
- [ ] **Step 3: Run tests:** `cd frontend && bun vitest run`
- [ ] **Step 4: Commit:** `git add src/libs/games-api.ts && git commit -m "feat: add Zod runtime validation to games API responses"`

---

### Task 6: Fix logout error handling

**Files:**
- Modify: `frontend/src/hooks/useAuth.ts`

Current issue (line 35): `.catch(() => { window.location.href = keycloakLogoutUrl; })` always redirects even if `signOut` throws for a non-redirect reason.

Fix: Only redirect to Keycloak if signOut succeeds. On failure, still redirect but log the error.

```typescript
    logout: () => {
      const idToken = session?.idToken;
      const params = new URLSearchParams({
        client_id: 'crash-game-client',
        post_logout_redirect_uri: window.location.origin + '/login',
      });
      if (idToken) params.set('id_token_hint', idToken);

      const keycloakLogoutUrl = `${KEYCLOAK_PUBLIC_URL}/realms/crash-game/protocol/openid-connect/logout?${params}`;
      signOut({ redirect: false })
        .then(() => { window.location.href = keycloakLogoutUrl; })
        .catch((error) => {
          console.error('Failed to sign out:', error);
          window.location.href = '/login';
        });
    },
```

Key change: On signOut failure, redirect to `/login` instead of Keycloak (Keycloak redirect may also fail if session is already invalid).

- [ ] **Step 1: Make the change**
- [ ] **Step 2: Run tests:** `cd frontend && bun vitest run`
- [ ] **Step 3: Commit:** `git add src/hooks/useAuth.ts && git commit -m "fix: improve logout error handling with proper fallback"`

---

### Task 7: Handle token refresh failure

**Files:**
- Modify: `frontend/src/libs/auth.ts`

Current issue (line 122): `catch { return { ...token, error: 'RefreshAccessTokenError' }; }` silently sets an error flag but the user never knows.

Fix: Add the error to the session callback so the frontend can detect it. Then add a useEffect in the session provider or a dedicated hook to force logout when refresh fails.

In `auth.ts`, the session callback already exposes `token.error` (line 130). The fix is in the frontend — add detection in `useAuth.ts`:

```typescript
// Add to useAuth hook
useEffect(() => {
  if (session?.error === 'RefreshAccessTokenError') {
    signOut({ callbackUrl: '/login' });
  }
}, [session?.error]);
```

This needs `useEffect` import added.

- [ ] **Step 1: Read current useAuth.ts**
- [ ] **Step 2: Add useEffect import and refresh error detection**
- [ ] **Step 3: Run tests:** `cd frontend && bun vitest run`
- [ ] **Step 4: Commit:** `git add src/hooks/useAuth.ts && git commit -m "fix: auto-logout on token refresh failure"`

---

### Task 8: Final verification

- [ ] **Step 1: Run all tests:** `cd frontend && bun vitest run`
- [ ] **Step 2: TypeScript check:** `cd frontend && bunx tsc --noEmit`
- [ ] **Step 3: Build check:** `cd frontend && bun run build`

---

## Summary

| Task | Category | Description |
|------|----------|-------------|
| 1 | Refactor | Extract useConnection hook |
| 2 | Refactor | Extract useRoundSync hook |
| 3 | Refactor | Extract useGameEvents hook |
| 4 | Refactor | Rewrite useGameWebSocket as orchestrator |
| 5 | API | Add Zod validation to games-api.ts |
| 6 | Auth | Fix logout error handling |
| 7 | Auth | Auto-logout on token refresh failure |
| 8 | Verify | Full suite + build check |
