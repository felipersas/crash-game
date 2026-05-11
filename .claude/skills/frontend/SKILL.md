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
├── app/
│   ├── (auth)/login/           # Auth route group
│   ├── (games)/
│   │   ├── _components/        # Route-scoped components
│   │   │   ├── bet-controls/   # BetButton, BetInput, BetStatusDisplay, useBetToast
│   │   │   ├── bets-list/      # BetsList
│   │   │   ├── crash-graph/    # CrashGraph, useCurvePoints
│   │   │   ├── game-layout/    # GameLayout (shell)
│   │   │   ├── round-history/  # RoundHistory, RoundHistoryTable, VerificationModal
│   │   │   └── sidebar/        # Sidebar, MobileBottomNav
│   │   ├── games/              # Game pages + bets/me + rounds/*
│   │   └── layout.tsx          # Games layout with providers
│   └── layout.tsx              # Root layout
├── components/ui/              # Shared UI primitives (Button, Input, Popover, etc.)
├── hooks/                      # useGame, useGameWebSocket, useAuth, useWallet, useGameSounds, etc.
├── infrastructure/
│   ├── api/                    # games-api.ts, wallets-api.ts, http-client.ts
│   └── auth/                   # keycloak-provider.ts, nextauth.config.ts
├── store/                      # Zustand stores (game-store.ts)
├── websocket/                  # GamesWebSocket class, websocket.types.ts
├── shared/
│   ├── constants/              # api.constants.ts, game.constants.ts, error-codes.ts
│   ├── schemas/                # Zod schemas (api-schemas, bet-form.schema)
│   └── utils/                  # money.ts, crypto.ts
├── types/                      # game.types.ts
├── e2e/                        # Playwright specs (multiplayer.spec.ts)
└── middleware.ts               # Auth middleware
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
- Manages connection lifecycle (connect on mount, disconnect on unmount)
- On connect: syncs current round via REST, then subscribes to WS events
- All WS events update Zustand store via store actions
- Uses `currentRoundIdRef` to filter stale events
- Sounds triggered from WS callbacks (`playCrash` on crash)

### API Layer
```typescript
// infrastructure/api/http-client.ts — base client with auth
// infrastructure/api/games-api.ts — game endpoints
// infrastructure/api/wallets-api.ts — wallet endpoints
```
All API calls go through Kong gateway (`localhost:8000`).

### Component Conventions
- Route-scoped components live in `_components/` folders
- Shared UI in `components/ui/`
- Custom hooks for complex logic (`useCurvePoints`, `useBetToast`)
- `use client` directive for interactive components
- Server components for data fetching pages (`page.tsx`)

### Money Formatting
```typescript
// shared/utils/money.ts
export function formatMoney(cents: number): string  // 1000 → "10.00"
```

### Game Constants
```typescript
// shared/constants/game.constants.ts
GAME_CONSTANTS.MIN_BET_CENTS = 100    // $1.00
GAME_CONSTANTS.MAX_BET_CENTS = 100000 // $1,000.00
GAME_CONSTANTS.BETTING_DURATION_MS = 10000
```

### Auth Flow
- NextAuth with Keycloak provider (`infrastructure/auth/`)
- `middleware.ts` protects game routes
- `hooks/useAuth.ts` for auth state
- Token passed to WebSocket for authentication

## Validation
- [ ] No direct state mutation — always through Zustand actions
- [ ] WS events check `currentRoundId` before applying
- [ ] Money displayed via `formatMoney()`, never raw division
- [ ] `use client` only where needed (interactivity)
- [ ] API errors handled with toast (sonner)
- [ ] Responsive: MobileBottomNav for small screens
