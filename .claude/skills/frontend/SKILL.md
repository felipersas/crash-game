---
name: frontend
description: Frontend patterns — Next.js App Router, Zustand store, WebSocket hooks, TanStack Query, cyber theme
triggers:
  - "frontend"
  - "nextjs"
  - "game store"
  - "web socket hook"
  - "game component"
  - "bet input"
  - "crash graph"
tags: [frontend, nextjs, react, zustand, websocket, crash-game]
---

# Frontend

Patterns for `frontend/` — Next.js App Router with real-time game UI.

## Purpose

Guide all changes to the frontend following established conventions for state management, WebSocket integration, and component structure.

## Architecture

```
frontend/
├── middleware.ts                    # NextAuth route protection (/games is public)
├── next-auth.d.ts                   # Session / JWT type augmentation
├── src/
│   ├── app/
│   │   ├── (auth)/login/            # Auth route group
│   │   ├── (games)/
│   │   │   ├── _components/sidebar/ # Sidebar, MobileBottomNav
│   │   │   ├── games/
│   │   │   │   ├── _components/     # Route-scoped components
│   │   │   │   │   ├── bet-controls/  # BetControls (form), BetInput, AutoCashOut, BetStatusDisplay, useBetToast
│   │   │   │   │   ├── bets-list/     # BetsList
│   │   │   │   │   ├── crash-graph/   # CrashGraph, useCurvePoints
│   │   │   │   │   ├── game-layout/   # GameLayout (shell + balance)
│   │   │   │   │   └── round-history/ # RoundHistory, RoundHistoryTable, VerificationModal
│   │   │   │   ├── bets/me/         # My bets page
│   │   │   │   ├── rounds/          # history + [roundId]/verify pages
│   │   │   │   └── game-content.tsx # Main game screen (opens the WebSocket)
│   │   │   └── layout.tsx
│   │   ├── api/auth/[...nextauth]/  # NextAuth route
│   │   └── layout.tsx               # Root layout
│   ├── components/ui/               # Shared UI primitives (Button, Input, Popover, Skeleton)
│   ├── constants/                   # api.ts, game.ts (GAME_CONSTANTS), error-codes.ts
│   ├── domain/                      # money.ts (bigint cents helpers)
│   ├── hooks/                       # useGame, useWallet, useGameWebSocket (+ useConnection,
│   │                                # useRoundSync, useGameEvents), useSeedVerification, ...
│   ├── libs/                        # axios.ts, games-api.ts, wallets-api.ts, auth.ts,
│   │                                # providers.tsx, get-query-client.ts, server-fetch.ts
│   ├── schemas/                     # Zod schemas (bet-form.schema.ts)
│   ├── store/                       # Zustand store (game-store.ts)
│   ├── types/                       # bet.ts, game.ts (BetStatus, RoundStatus, Phase, ...)
│   ├── utils/                       # crypto.ts, helpers.ts
│   └── websocket/                   # GamesWebSocket class, websocket.types.ts
├── tests/                           # Vitest setup + render helpers
└── e2e/                             # Playwright specs (multiplayer.spec.ts)
```

## Key Patterns

### State Management (Zustand)
```typescript
// store/game-store.ts
export const useGameStore = create<GameState>()(
  devtools<GameState>((set, get) => ({
    ...initialState,
    // Actions update state immutably
    setMultiplier: (multiplier) => set({ liveMultiplier: multiplier }),
    // Derived getters use get()
    getBettingProgress: () => { const state = get(); ... },
  }), { name: 'GameStore' }),
);
```

**Rules**:
- Store holds ALL real-time state (round status, multiplier, bets, connection)
- Components read from store, hooks write to store
- `useGameStore(state => state.xxx)` for selective subscriptions
- `useGameStore.getState()` for reading outside React (e.g., in WS callbacks)

### WebSocket Hook
```typescript
// hooks/useGameWebSocket.ts
export function useGameWebSocket(options): UseGameWebSocketReturn
```
- Enable it only once the session is resolved (`enabled: status !== "loading"`)
- Reconnects when `enabled`, `token` or `playerId` change (handlers are rebuilt, never stale)
- `useConnection` guards on the socket instance (`wsRef.current`), not on `connected`
- On connect: syncs current round via REST (`useRoundSync`), restoring my bet
- All WS events update Zustand store via store actions (`useGameStore.getState()` in handlers)
- Uses `currentRoundIdRef` to filter stale events
- Sounds triggered from WS callbacks (`playCrash` on crash)
- Never write refs during render; keep effects free of synchronous setState

### API Layer
```typescript
// libs/axios.ts — axios client with auth interceptor, typed ApiError
// libs/games-api.ts — game endpoints
// libs/wallets-api.ts — wallet endpoints
```
- Type query errors: `useQuery<T, ApiError>` (no `as unknown as ApiError`)
- Optimistic bet: status is always `BetStatus.PENDING` until `betConfirmed`
All API calls go through Kong gateway (`localhost:8000`).

### Component Conventions
- Route-scoped components live in `_components/` folders
- Shared UI in `components/ui/`
- Custom hooks for complex logic (`useCurvePoints`, `useBetToast`)
- `use client` directive for interactive components
- Server components for data fetching pages (`page.tsx`)

### Money (integer cents only)
```typescript
// domain/money.ts — bigint arithmetic, accepts number | bigint | string cents
formatMoney(1050)            // "$10.50"   formatMoney(-500) → "-$5.00"
centsToDecimal(1050)         // "10.50"
calculatePayout(1000, 2.019) // 2010 — multiplier truncated to hundredths (matches backend)
```
- `GET /wallets/me` → `balance` is a string of integer cents (`useWallet().balanceCents`)
- Compare/subtract balances with `BigInt`, never `parseFloat` / `Number(x) * 100`
- Never `(cents / 100).toFixed(2)`

### Game Constants
```typescript
// constants/game.ts
GAME_CONSTANTS.MIN_BET_CENTS = 100    // $1.00
GAME_CONSTANTS.MAX_BET_CENTS = 100000 // $1,000.00
GAME_CONSTANTS.MIN_AUTO_CASHOUT = 1.01
GAME_CONSTANTS.MAX_AUTO_CASHOUT = 1000
GAME_CONSTANTS.BETTING_DURATION_MS = 10000
```
- Use `BetStatus` / `RoundStatus` enums, never raw status strings

### Auth Flow
- NextAuth with Keycloak provider (`libs/auth.ts`)
- `middleware.ts` protects game routes
- `hooks/useAuth.ts` for auth state
- `libs/auth.ts` — NextAuth options (typed callbacks, token refresh)
- Token passed to WebSocket for authentication

## Validation
- [ ] No direct state mutation — always through Zustand actions
- [ ] WS events check `currentRoundId` before applying
- [ ] Money displayed via `formatMoney()`, never raw division; no float money math
- [ ] Raw `<button>`s inside a `<form>` have an explicit `type`
- [ ] `bun run lint` (0 errors), `bunx tsc --noEmit`, `bun run test`, `bun run build` pass
- [ ] `use client` only where needed (interactivity)
- [ ] API errors handled with toast (sonner)
- [ ] Responsive: MobileBottomNav for small screens
