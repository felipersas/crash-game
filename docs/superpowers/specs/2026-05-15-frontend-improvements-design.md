# Frontend Improvements — Phase 1: Tests, Performance, Accessibility

**Date**: 2026-05-15
**Branch**: `fix/patterns`
**Goal**: Maximize code review impact for fullstack challenge

## Context

Frontend is a Next.js 15 app with ~69 TS/TSX files. Architecture is solid (Zustand, React Query, Socket.IO, DDD). Zero unit tests, missing a11y, unoptimized renders. Three-phase improvement plan; this spec covers Phase 1.

## 1. Tests — Vitest + React Testing Library

### Setup

- `vitest.config.ts` — jsdom environment, path aliases matching tsconfig
- `frontend/tests/setup.ts` — global cleanup, mocks for WebSocket, Audio, IntersectionObserver, matchMedia

### Test Matrix

| Layer | File | Test Type | Key Scenarios |
|-------|------|-----------|---------------|
| Utils | `domain/money.ts` | Pure unit | BigInt formatting, zero, negative, large values |
| Utils | `utils/crypto.ts` | Pure unit | SHA-256 with known test vectors |
| Utils | `utils/helpers.ts` | Pure unit | cn() className merging |
| Store | `store/game-store.ts` | Unit | Actions (setRound, addBet, setMultiplier), computed (getBettingProgress), reset |
| Hooks | `hooks/useWallet` | Hook | Query states (loading/error/success), optimistic balance update |
| Hooks | `hooks/useGame` | Hook | Place bet, cashout, error handling with toast |
| Hooks | `hooks/useMyBets` | Hook | Pagination, empty state, loading |
| Hooks | `hooks/useRoundHistory` | Hook | Loading, error recovery, data transformation |
| Components | `_components/bets-list/BetsList` | RTL | Empty list, populated list, sorted order |
| Components | `_components/bet-controls/BetControls` | RTL | Input validation, submit flow, disabled states |
| Components | `_components/crash-graph/CrashGraph` | RTL | Idle/active/crashed states, multiplier display |

### Mock Strategy

- `vi.mock('../libs/games-api')` and `vi.mock('../libs/wallets-api')` — spy implementations
- `vi.mock('../store/game-store')` — Zustand mock with controlled state
- `vi.stubGlobal('WebSocket', FakeWebSocket)` — constructor mock
- MSW not used — direct API mock is simpler for hook tests

## 2. Performance

### React.memo

- `CrashGraph` — re-renders every 50ms during active round. Memo on all props.
- `BetsList` — re-renders on every new bet. Memo on `bets` prop.

### Zustand Selectors

Replace broad subscriptions with granular selectors:
```ts
// Before
const { multiplier, round } = useGameStore()
// After
const multiplier = useGameStore(s => s.liveMultiplier)
const round = useGameStore(s => s.currentRound)
```

### useMemo/useCallback

- `useCurvePoints` — memoize computed points array
- Event handlers passed to child components — wrap with useCallback where missing

## 3. Accessibility

### Live Regions

- Multiplier value: `<span role="status" aria-live="polite" aria-atomic="true">` — announces updates to screen readers without interrupting

### Modal Improvements

- `VerificationModal`: focus trap using `inert` attribute on sibling elements
- Escape key handler to close modal
- Return focus to trigger element on close

### Color Independence

- Crash point indicators: add text labels alongside color coding
  - Red crash (< 2x): text label "low crash"
  - Green crash (>= 2x): text label "moon"
- Bet status: ensure text label exists alongside color/icon

### Reduced Motion

- `@media (prefers-reduced-motion: reduce)` — disable glow animations, graph transitions
- Respect user preference for vestibular disorder safety

## Out of Scope (Phase 2 & 3)

- `useGameWebSocket` refactor into smaller hooks
- Zod runtime validation on API responses
- Auth error handling improvements
- CSS file splitting
- Export standardization
