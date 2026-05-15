# Frontend Phase 1 — Tests, Performance, Accessibility

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vitest + RTL test suite, optimize renders with React.memo and Zustand selectors, and add a11y improvements (aria-live, focus trap, reduced motion).

**Architecture:** Test infrastructure first (config + setup + helpers), then pure unit tests (utils/store), then hook tests with `renderHook`, then component tests with RTL. Performance and a11y changes interleaved as they touch the same files.

**Tech Stack:** Vitest, @testing-library/react, @testing-library/jest-dom, jsdom, React 19, Zustand 5, TanStack Query 5, Next.js 16

---

## File Structure

### New Files
- `frontend/vitest.config.ts` — Vitest configuration with jsdom, path aliases
- `frontend/tests/setup.ts` — Global setup: cleanup, mocks (WS, Audio, matchMedia)
- `frontend/tests/helpers.tsx` — Shared test utilities (custom render with providers)
- `frontend/src/domain/__tests__/money.test.ts` — Money formatting unit tests
- `frontend/src/utils/__tests__/crypto.test.ts` — SHA-256 unit tests
- `frontend/src/utils/__tests__/helpers.test.ts` — cn() unit test
- `frontend/src/store/__tests__/game-store.test.ts` — Store unit tests
- `frontend/src/hooks/__tests__/useWallet.test.ts` — Hook test
- `frontend/src/hooks/__tests__/useMyBets.test.ts` — Hook test
- `frontend/src/hooks/__tests__/useRoundHistory.test.ts` — Hook test
- `frontend/src/app/(games)/games/_components/bets-list/__tests__/BetsList.test.tsx` — Component test
- `frontend/src/app/(games)/games/_components/bet-controls/__tests__/BetControls.test.tsx` — Component test
- `frontend/src/app/(games)/games/_components/crash-graph/__tests__/CrashGraph.test.tsx` — Component test

### Modified Files
- `frontend/package.json` — Add test deps + script
- `frontend/src/app/(games)/games/_components/bets-list/BetsList.tsx` — React.memo
- `frontend/src/app/(games)/games/_components/crash-graph/CrashGraph.tsx` — React.memo + aria-live + reduced motion
- `frontend/src/app/(games)/games/_components/round-history/VerificationModal.tsx` — Focus trap + Escape key
- `frontend/src/app/(games)/games/_components/round-history/RoundHistoryTable.tsx` — Text labels for crash points
- `frontend/src/styles/global.css` — prefers-reduced-motion rules

---

### Task 1: Install Vitest + RTL dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd frontend && bun add -d vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

- [ ] **Step 2: Add test script to package.json**

Add to `scripts` in `frontend/package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/bun.lock
git commit -m "chore: add vitest and testing-library dependencies"
```

---

### Task 2: Configure Vitest

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/tests/setup.ts`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 2: Create tests/setup.ts**

```typescript
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { accessToken: 'test-token', playerId: 'player-1', user: { username: 'testplayer' } },
    status: 'authenticated',
  })),
  getSession: vi.fn(async () => ({
    accessToken: 'test-token',
    playerId: 'player-1',
    user: { username: 'testplayer' },
  })),
  signOut: vi.fn(),
}));

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState = 0;
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  constructor(url: string) { this.url = url; }
}

vi.stubGlobal('WebSocket', MockWebSocket);

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
vi.stubGlobal('IntersectionObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})));

// Mock Audio
vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  load: vi.fn(),
  volume: 1,
  src: '',
})));

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve('')),
  },
});

// Mock ResizeObserver
vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})));

// Suppress console.error for expected test noise
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('act(')) return;
    originalError.call(console, ...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
```

- [ ] **Step 3: Verify setup loads**

```bash
cd frontend && bun vitest run --reporter=verbose 2>&1 | head -5
```

Expected: "no test files found" or similar — config loads without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/vitest.config.ts frontend/tests/setup.ts
git commit -m "chore: configure vitest with jsdom, path aliases and global mocks"
```

---

### Task 3: Test helpers (custom render with providers)

**Files:**
- Create: `frontend/tests/helpers.tsx`

- [ ] **Step 1: Create helpers.tsx**

```tsx
import React, { ReactNode } from 'react';
import { render, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
    logger: {
      log: console.log,
      warn: console.warn,
      error: () => {},
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

export function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: WrapperProps) {
    return (
      <SessionProvider session={{ accessToken: 'test-token', playerId: 'player-1', user: { username: 'testplayer' } }}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </SessionProvider>
    );
  };
}

export function renderWithProviders(ui: React.ReactElement) {
  const Wrapper = createWrapper();
  return render(ui, { wrapper: Wrapper });
}

export function renderHookWithProviders<T>(hook: () => T) {
  const Wrapper = createWrapper();
  return renderHook(hook, { wrapper: Wrapper });
}

// Re-export everything from RTL for convenience
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
```

- [ ] **Step 2: Commit**

```bash
git add frontend/tests/helpers.tsx
git commit -m "test: add shared test helpers with query and session providers"
```

---

### Task 4: Unit tests — money.ts

**Files:**
- Create: `frontend/src/domain/__tests__/money.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { formatMoney, formatMultiplier, calculatePayout } from '../money';

describe('formatMoney', () => {
  it('formats zero cents', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('formats positive cents (number)', () => {
    expect(formatMoney(1000)).toBe('$10.00');
  });

  it('formats positive cents (bigint)', () => {
    expect(formatMoney(BigInt(1000))).toBe('$10.00');
  });

  it('formats single dollar', () => {
    expect(formatMoney(100)).toBe('$1.00');
  });

  it('formats sub-dollar amounts', () => {
    expect(formatMoney(50)).toBe('$0.50');
  });

  it('formats single cent', () => {
    expect(formatMoney(1)).toBe('$0.01');
  });

  it('formats large amounts', () => {
    expect(formatMoney(10000000)).toBe('$100000.00');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(-500)).toBe('-$5.00');
  });

  it('formats max bet amount', () => {
    expect(formatMoney(100000)).toBe('$1000.00');
  });

  it('formats min bet amount', () => {
    expect(formatMoney(100)).toBe('$1.00');
  });
});

describe('formatMultiplier', () => {
  it('formats 1x', () => {
    expect(formatMultiplier(1)).toBe('1.00x');
  });

  it('formats crash point', () => {
    expect(formatMultiplier(2.47)).toBe('2.47x');
  });

  it('formats high multiplier', () => {
    expect(formatMultiplier(100.5)).toBe('100.50x');
  });
});

describe('calculatePayout', () => {
  it('calculates payout for 1x multiplier', () => {
    expect(calculatePayout(1000, 1)).toBe(1000);
  });

  it('calculates payout for 2x multiplier', () => {
    expect(calculatePayout(1000, 2)).toBe(2000);
  });

  it('calculates payout for fractional multiplier', () => {
    expect(calculatePayout(1000, 1.5)).toBe(1500);
  });

  it('floors the result', () => {
    // 333 * 2.47 = 820.51 -> floors to 820
    expect(calculatePayout(333, 2.47)).toBe(820);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run src/domain/__tests__/money.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domain/__tests__/money.test.ts
git commit -m "test: add unit tests for money formatting utilities"
```

---

### Task 5: Unit tests — crypto.ts

**Files:**
- Create: `frontend/src/utils/__tests__/crypto.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { hexToBytes, computeSHA256 } from '../crypto';

describe('hexToBytes', () => {
  it('converts empty string', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
  });

  it('converts "00"', () => {
    expect(hexToBytes('00')).toEqual(new Uint8Array([0]));
  });

  it('converts "ff"', () => {
    expect(hexToBytes('ff')).toEqual(new Uint8Array([255]));
  });

  it('converts multi-byte hex', () => {
    expect(hexToBytes('0102ff')).toEqual(new Uint8Array([1, 2, 255]));
  });
});

describe('computeSHA256', () => {
  it('computes SHA-256 of empty string', async () => {
    // SHA-256 of empty bytes
    const result = await computeSHA256('');
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('computes SHA-256 of known hex string', async () => {
    // SHA-256 of bytes [0x61, 0x62, 0x63] ("abc")
    const result = await computeSHA256('616263');
    expect(result).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('produces 64-char hex string', async () => {
    const result = await computeSHA256('abcdef');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run src/utils/__tests__/crypto.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/__tests__/crypto.test.ts
git commit -m "test: add unit tests for crypto SHA-256 utilities"
```

---

### Task 6: Unit tests — helpers.ts (cn function)

**Files:**
- Create: `frontend/src/utils/__tests__/helpers.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { cn } from '../helpers';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });

  it('deduplicates tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('handles undefined', () => {
    expect(cn('foo', undefined)).toBe('foo');
  });

  it('handles empty input', () => {
    expect(cn()).toBe('');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run src/utils/__tests__/helpers.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/__tests__/helpers.test.ts
git commit -m "test: add unit tests for className helper"
```

---

### Task 7: Unit tests — game-store.ts

**Files:**
- Create: `frontend/src/store/__tests__/game-store.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../game-store';
import { RoundStatus } from '@/types/game.types';
import type { Bet } from '@/types/game.types';
import { GAME_CONSTANTS } from '@/constants/game';

const mockBet: Bet = {
  id: 'bet-1',
  roundId: 'round-1',
  playerId: 'player-1',
  playerName: 'TestPlayer',
  amountCents: 1000,
  amountDecimal: '10.00',
  status: 'ACTIVE' as Bet['status'],
  cashOutMultiplier: null,
  payoutCents: null,
  payoutDecimal: null,
  cashedOutAt: null,
};

describe('game-store', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useGameStore.setState({
      isHydrated: false,
      isConnected: false,
      connectionStatus: 'disconnected',
      currentRoundId: null,
      roundStatus: RoundStatus.BETTING,
      liveMultiplier: 1.0,
      bettingEndTime: null,
      roundStartedAt: null,
      currentSeedHash: null,
      myActiveBet: null,
      currentBets: [],
    });
  });

  describe('setRoundStarted', () => {
    it('sets round state to BETTING with new round data', () => {
      const endTime = new Date(Date.now() + 10000);
      useGameStore.getState().setRoundStarted('round-1', 'hash123', endTime);

      const state = useGameStore.getState();
      expect(state.currentRoundId).toBe('round-1');
      expect(state.roundStatus).toBe(RoundStatus.BETTING);
      expect(state.liveMultiplier).toBe(1.0);
      expect(state.currentSeedHash).toBe('hash123');
      expect(state.currentBets).toEqual([]);
      expect(state.myActiveBet).toBeNull();
    });
  });

  describe('setMultiplier', () => {
    it('updates live multiplier', () => {
      useGameStore.getState().setMultiplier(2.5);
      expect(useGameStore.getState().liveMultiplier).toBe(2.5);
    });
  });

  describe('setCrash', () => {
    it('sets round to CRASHED status with crash point', () => {
      useGameStore.getState().setCrash(3.14);
      const state = useGameStore.getState();
      expect(state.roundStatus).toBe(RoundStatus.CRASHED);
      expect(state.liveMultiplier).toBe(3.14);
    });
  });

  describe('setBettingEnded', () => {
    it('transitions to ACTIVE status', () => {
      useGameStore.getState().setBettingEnded();
      expect(useGameStore.getState().roundStatus).toBe(RoundStatus.ACTIVE);
      expect(useGameStore.getState().bettingEndTime).toBeNull();
    });
  });

  describe('setMyActiveBet', () => {
    it('sets active bet', () => {
      useGameStore.getState().setMyActiveBet(mockBet);
      expect(useGameStore.getState().myActiveBet).toEqual(mockBet);
    });

    it('clears active bet with null', () => {
      useGameStore.getState().setMyActiveBet(mockBet);
      useGameStore.getState().setMyActiveBet(null);
      expect(useGameStore.getState().myActiveBet).toBeNull();
    });
  });

  describe('addBet', () => {
    it('adds a bet to currentBets', () => {
      useGameStore.getState().addBet(mockBet);
      expect(useGameStore.getState().currentBets).toHaveLength(1);
    });

    it('ignores duplicate bet by id', () => {
      useGameStore.getState().addBet(mockBet);
      useGameStore.getState().addBet(mockBet);
      expect(useGameStore.getState().currentBets).toHaveLength(1);
    });
  });

  describe('updateBet', () => {
    it('updates specific bet fields', () => {
      useGameStore.getState().addBet(mockBet);
      useGameStore.getState().updateBet('bet-1', { status: 'CASHED_OUT' });
      expect(useGameStore.getState().currentBets[0].status).toBe('CASHED_OUT');
    });
  });

  describe('updateBetStatus', () => {
    it('updates myActiveBet when betId matches', () => {
      useGameStore.getState().setMyActiveBet(mockBet);
      useGameStore.getState().updateBetStatus('bet-1', 'CASHED_OUT', {
        multiplier: 2.5,
        payoutCents: 2500,
        payoutDecimal: '25.00',
      });

      const bet = useGameStore.getState().myActiveBet!;
      expect(bet.status).toBe('CASHED_OUT');
      expect(bet.cashOutMultiplier).toBe(2.5);
      expect(bet.payoutCents).toBe(2500);
    });

    it('does nothing when betId does not match myActiveBet', () => {
      useGameStore.getState().setMyActiveBet(mockBet);
      useGameStore.getState().updateBetStatus('other-bet', 'CASHED_OUT');
      expect(useGameStore.getState().myActiveBet!.status).toBe('ACTIVE');
    });
  });

  describe('getBettingTimeRemaining', () => {
    it('returns 0 when no bettingEndTime', () => {
      expect(useGameStore.getState().getBettingTimeRemaining()).toBe(0);
    });

    it('returns remaining seconds when in BETTING phase', () => {
      const endTime = new Date(Date.now() + 5000);
      useGameStore.setState({
        roundStatus: RoundStatus.BETTING,
        bettingEndTime: endTime,
      });
      const remaining = useGameStore.getState().getBettingTimeRemaining();
      expect(remaining).toBeGreaterThan(4);
      expect(remaining).toBeLessThanOrEqual(5);
    });

    it('returns 0 when not in BETTING phase', () => {
      const endTime = new Date(Date.now() + 5000);
      useGameStore.setState({
        roundStatus: RoundStatus.ACTIVE,
        bettingEndTime: endTime,
      });
      expect(useGameStore.getState().getBettingTimeRemaining()).toBe(0);
    });
  });

  describe('getBettingProgress', () => {
    it('returns 0 when no bettingEndTime', () => {
      expect(useGameStore.getState().getBettingProgress()).toBe(0);
    });

    it('returns progress between 0 and 1 during betting', () => {
      const elapsed = 3000;
      const endTime = new Date(Date.now() + GAME_CONSTANTS.BETTING_DURATION_MS - elapsed);
      useGameStore.setState({
        roundStatus: RoundStatus.BETTING,
        bettingEndTime: endTime,
      });
      const progress = useGameStore.getState().getBettingProgress();
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(1);
    });
  });

  describe('connection', () => {
    it('sets connection status', () => {
      useGameStore.getState().setConnectionStatus('connected');
      expect(useGameStore.getState().connectionStatus).toBe('connected');
    });

    it('sets connected boolean', () => {
      useGameStore.getState().setConnected(true);
      expect(useGameStore.getState().isConnected).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run src/store/__tests__/game-store.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/__tests__/game-store.test.ts
git commit -m "test: add unit tests for game store"
```

---

### Task 8: Hook tests — useRoundHistory

**Files:**
- Create: `frontend/src/hooks/__tests__/useRoundHistory.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRoundHistory } from '../useRoundHistory';
import { renderHookWithProviders, waitFor } from '@/tests/helpers';
import type { RoundHistoryResponse } from '@/schemas/api-schemas';

const mockResponse: RoundHistoryResponse = {
  data: [
    {
      roundId: 'round-1',
      crashPoint: 2.5,
      status: 'CRASHED',
      startedAt: new Date('2026-05-15'),
      crashedAt: new Date('2026-05-15'),
      totalBets: 10,
      totalWageredCents: 5000,
      totalWageredDecimal: '50.00',
    },
  ],
  meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

describe('useRoundHistory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns loading state initially', () => {
    vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHookWithProviders(() => useRoundHistory());
    expect(result.current.isLoading).toBe(true);
  });

  it('returns data on success', async () => {
    const { get } = await import('@/libs/axios');
    vi.mocked(get).mockResolvedValueOnce(mockResponse);

    const { result } = renderHookWithProviders(() => useRoundHistory());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResponse);
  });

  it('accepts page and limit params', async () => {
    const { get } = await import('@/libs/axios');
    vi.mocked(get).mockResolvedValueOnce(mockResponse);

    renderHookWithProviders(() => useRoundHistory({ page: 2, limit: 10 }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining('page=2&limit=10')));
  });
});
```

- [ ] **Step 2: Mock axios module for hook tests**

Add to `frontend/tests/setup.ts` after the existing mocks:

```typescript
// Mock API layer — individual tests override with vi.mocked()
vi.mock('@/libs/axios', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  apiClient: {
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  },
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && bun vitest run src/hooks/__tests__/useRoundHistory.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/setup.ts frontend/src/hooks/__tests__/useRoundHistory.test.ts
git commit -m "test: add hook tests for useRoundHistory"
```

---

### Task 9: Hook tests — useMyBets

**Files:**
- Create: `frontend/src/hooks/__tests__/useMyBets.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMyBets } from '../useMyBets';
import { renderHookWithProviders, waitFor } from '@/tests/helpers';
import type { MyBetsResponse } from '@/schemas/api-schemas';

const mockResponse: MyBetsResponse = {
  data: [
    {
      id: 'bet-1',
      roundId: 'round-1',
      amountCents: 1000,
      amountDecimal: '10.00',
      cashOutMultiplier: 2.5,
      payoutCents: 2500,
      payoutDecimal: '25.00',
      profitCents: 1500,
      profitDecimal: '15.00',
      status: 'CASHED_OUT',
      cashedOutAt: new Date('2026-05-15'),
      placedAt: new Date('2026-05-15'),
    },
  ],
  meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  summary: {
    totalWageredCents: 1000,
    totalWageredDecimal: '10.00',
    wins: 1,
    losses: 0,
    profitCents: 1500,
    profitDecimal: '15.00',
  },
};

describe('useMyBets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns loading state initially', () => {
    const { result } = renderHookWithProviders(() => useMyBets());
    expect(result.current.isLoading).toBe(true);
  });

  it('returns data on success', async () => {
    const { get } = await import('@/libs/axios');
    vi.mocked(get).mockResolvedValueOnce(mockResponse);

    const { result } = renderHookWithProviders(() => useMyBets());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResponse);
  });

  it('shows error toast on failure', async () => {
    const { get } = await import('@/libs/axios');
    const toast = await import('sonner');
    vi.spyOn(toast, 'toast', 'getter').mockReturnValue({ error: vi.fn() } as never);

    vi.mocked(get).mockRejectedValueOnce({ message: 'fail', status: 500 });

    const { result } = renderHookWithProviders(() => useMyBets());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run src/hooks/__tests__/useMyBets.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/__tests__/useMyBets.test.ts
git commit -m "test: add hook tests for useMyBets"
```

---

### Task 10: Hook tests — useWallet

**Files:**
- Create: `frontend/src/hooks/__tests__/useWallet.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWallet } from '../useWallet';
import { renderHookWithProviders, waitFor } from '@/tests/helpers';
import type { Wallet } from '@/types/game.types';

const mockWallet: Wallet = {
  walletId: 'wallet-1',
  playerId: 'player-1',
  balance: '100.00',
  version: 1,
};

describe('useWallet', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns loading state initially', () => {
    const { result } = renderHookWithProviders(() => useWallet());
    expect(result.current.isLoading).toBe(true);
  });

  it('returns wallet data on success', async () => {
    const { get } = await import('@/libs/axios');
    vi.mocked(get).mockResolvedValueOnce(mockWallet);

    const { result } = renderHookWithProviders(() => useWallet());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.wallet).toEqual(mockWallet);
    expect(result.current.balance).toBe('100.00');
  });

  it('returns default balance when wallet is undefined', () => {
    const { result } = renderHookWithProviders(() => useWallet());
    expect(result.current.balance).toBe('0.00');
  });

  it('shows error toast on failure', async () => {
    const { get } = await import('@/libs/axios');
    vi.mocked(get).mockRejectedValueOnce({ message: 'fail', status: 500, code: 'WALLET_NOT_FOUND' });

    const { result } = renderHookWithProviders(() => useWallet());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run src/hooks/__tests__/useWallet.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/__tests__/useWallet.test.ts
git commit -m "test: add hook tests for useWallet"
```

---

### Task 11: Component tests — BetsList

**Files:**
- Create: `frontend/src/app/(games)/games/_components/bets-list/__tests__/BetsList.test.tsx`

- [ ] **Step 1: Write tests**

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/tests/helpers';
import BetsList from '../BetsList';
import { useGameStore } from '@/store/game-store';
import type { Bet } from '@/types/game.types';

const mockBets: Bet[] = [
  {
    id: 'bet-1',
    roundId: 'round-1',
    playerId: 'player-1',
    playerName: 'Alice',
    amountCents: 1000,
    amountDecimal: '10.00',
    status: 'ACTIVE',
    cashOutMultiplier: null,
    payoutCents: null,
    payoutDecimal: null,
    cashedOutAt: null,
  },
  {
    id: 'bet-2',
    roundId: 'round-1',
    playerId: 'player-2',
    playerName: 'Bob',
    amountCents: 500,
    amountDecimal: '5.00',
    status: 'CASHED_OUT',
    cashOutMultiplier: 2.5,
    payoutCents: 1250,
    payoutDecimal: '12.50',
    cashedOutAt: new Date(),
  },
];

describe('BetsList', () => {
  it('renders empty state when no bets', () => {
    renderWithProviders(<BetsList />);
    expect(screen.getByText('No active bets')).toBeInTheDocument();
    expect(screen.getByText('Waiting for players...')).toBeInTheDocument();
  });

  it('renders bets from store', () => {
    useGameStore.setState({ currentBets: mockBets });
    renderWithProviders(<BetsList />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('displays bet amounts formatted', () => {
    useGameStore.setState({ currentBets: [mockBets[0]] });
    renderWithProviders(<BetsList />);

    expect(screen.getByText('$10.00')).toBeInTheDocument();
  });

  it('displays cash out multiplier for cashed out bets', () => {
    useGameStore.setState({ currentBets: [mockBets[1]] });
    renderWithProviders(<BetsList />);

    expect(screen.getByText('@2.50x')).toBeInTheDocument();
  });

  it('shows Playing for active bets', () => {
    useGameStore.setState({ currentBets: [mockBets[0]] });
    renderWithProviders(<BetsList />);

    expect(screen.getByText('Playing')).toBeInTheDocument();
  });

  it('shows total bet count in footer', () => {
    useGameStore.setState({ currentBets: mockBets });
    renderWithProviders(<BetsList />);

    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run src/app/\(games\)/games/_components/bets-list/__tests__/BetsList.test.tsx
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(games\)/games/_components/bets-list/__tests__/BetsList.test.tsx
git commit -m "test: add component tests for BetsList"
```

---

### Task 12: Performance — React.memo on BetsList + CrashGraph

**Files:**
- Modify: `frontend/src/app/(games)/games/_components/bets-list/BetsList.tsx`
- Modify: `frontend/src/app/(games)/games/_components/crash-graph/CrashGraph.tsx`

- [ ] **Step 1: Wrap BetsList with React.memo**

In `BetsList.tsx`, add `memo` import and wrap export:

Change the import line:
```typescript
import { useMemo } from "react";
```
To:
```typescript
import { useMemo, memo } from "react";
```

Change the component declaration:
```typescript
export default function BetsList() {
```
To:
```typescript
function BetsList() {
```

Add at end of file:
```typescript
export default memo(BetsList);
```

- [ ] **Step 2: Wrap CrashGraph with React.memo**

In `CrashGraph.tsx`, add `memo` to the React import:

Change:
```typescript
import { useEffect, useState, useRef } from "react";
```
To:
```typescript
import { useEffect, useState, useRef, memo } from "react";
```

Change:
```typescript
export default function CrashGraph({ multiplier, phase, recentRounds = [] }: Props) {
```
To:
```typescript
function CrashGraph({ multiplier, phase, recentRounds = [] }: Props) {
```

Add at end of file:
```typescript
export default memo(CrashGraph);
```

- [ ] **Step 3: Run existing tests to verify no regressions**

```bash
cd frontend && bun vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(games\)/games/_components/bets-list/BetsList.tsx frontend/src/app/\(games\)/games/_components/crash-graph/CrashGraph.tsx
git commit -m "perf: wrap BetsList and CrashGraph with React.memo"
```

---

### Task 13: Performance — Zustand selectors in BetControls

**Files:**
- Modify: `frontend/src/app/(games)/games/_components/bet-controls/BetControls.tsx`

- [ ] **Step 1: Verify selectors are already granular**

Read `BetControls.tsx` lines 19-21. They already use granular selectors:
```typescript
const myActiveBet = useGameStore((s) => s.myActiveBet);
const roundStatus = useGameStore((s) => s.roundStatus);
const liveMultiplier = useGameStore((s) => s.liveMultiplier);
```

No changes needed — BetControls already follows best practices.

- [ ] **Step 2: Verify selectors in CrashGraph**

Read `CrashGraph.tsx` lines 154-156. They already use granular selectors:
```typescript
const currentSeedHash = useGameStore((s) => s.currentSeedHash);
const currentRoundId = useGameStore((s) => s.currentRoundId);
const currentBets = useGameStore((s) => s.currentBets);
```

No changes needed — CrashGraph already follows best practices.

- [ ] **Step 3: Check BetsList**

Read `BetsList.tsx` line 12. Already uses granular selector:
```typescript
const currentBets = useGameStore((s) => s.currentBets);
```

All components already use granular selectors. Skip commit.

---

### Task 14: Accessibility — aria-live on multiplier

**Files:**
- Modify: `frontend/src/app/(games)/games/_components/crash-graph/CrashGraph.tsx`

- [ ] **Step 1: Add aria-live to multiplier display**

In `CrashGraph.tsx`, find the multiplier display `motion.div` around line 228. Change:

```tsx
          <motion.div
            className={`font-black font-terminal tracking-tighter ${TEXT_CLASS[zone]} ${isBetting ? "text-3xl md:text-4xl" : "text-7xl md:text-8xl"}`}
            style={(isCrashed || phase === "active") ? { textShadow: GLOW_SHADOW[zone] } : undefined}
          >
            {getStatusLabel(phase, multiplier)}
          </motion.div>
```

To:

```tsx
          <motion.div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`font-black font-terminal tracking-tighter ${TEXT_CLASS[zone]} ${isBetting ? "text-3xl md:text-4xl" : "text-7xl md:text-8xl"}`}
            style={(isCrashed || phase === "active") ? { textShadow: GLOW_SHADOW[zone] } : undefined}
          >
            {getStatusLabel(phase, multiplier)}
          </motion.div>
```

- [ ] **Step 2: Run tests to verify no regressions**

```bash
cd frontend && bun vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(games\)/games/_components/crash-graph/CrashGraph.tsx
git commit -m "a11y: add aria-live region to multiplier display"
```

---

### Task 15: Accessibility — focus trap + Escape key on VerificationModal

**Files:**
- Modify: `frontend/src/app/(games)/games/_components/round-history/VerificationModal.tsx`

- [ ] **Step 1: Add focus trap and Escape key handling**

In `VerificationModal.tsx`, add `useEffect` and `useRef` imports. Change:

```typescript
import { useState } from 'react';
```

To:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
```

Add after the component state declarations (after line 19, `const [showHelp, setShowHelp] = useState(false);`):

```typescript
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;

    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Focus first focusable element
    const timer = setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>('button');
      focusable?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      clearTimeout(timer);
    };
  }, [handleKeyDown]);
```

Change the panel div to include `ref`:

```tsx
      <div
        className="panel-cyber max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
```

To:

```tsx
      <div
        ref={panelRef}
        className="panel-cyber max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
```

Also add `aria-modal` and `role` to the backdrop div:

```tsx
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
```

To:

```tsx
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verify Round"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(games\)/games/_components/round-history/VerificationModal.tsx
git commit -m "a11y: add focus trap and Escape key to VerificationModal"
```

---

### Task 16: Accessibility — text labels for crash point colors

**Files:**
- Modify: `frontend/src/app/(games)/games/_components/round-history/RoundHistoryTable.tsx`

- [ ] **Step 1: Add visually hidden text labels alongside crash point colors**

Add a helper function after `getCrashBg`:

```typescript
function getCrashLabel(cp: number | null): string {
  if (!cp) return '';
  if (cp < 1.5) return 'low crash';
  if (cp < 3) return 'medium crash';
  return 'high multiplier';
}
```

Add a `sr-only` utility CSS class comment (Tailwind v4 has this built-in as `sr-only`).

Change the crash point display (line 84-88):

```tsx
          <span className={`font-terminal text-sm font-bold ${getCrashColor(round.crashPoint)}`}>
            <span className={`inline-block px-2 py-0.5 rounded ${getCrashBg(round.crashPoint)}`}>
              {formatMultiplier(round.crashPoint || 0)}
            </span>
          </span>
```

To:

```tsx
          <span className={`font-terminal text-sm font-bold ${getCrashColor(round.crashPoint)}`}>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getCrashBg(round.crashPoint)}`}>
              {formatMultiplier(round.crashPoint || 0)}
              <span className="sr-only"> ({getCrashLabel(round.crashPoint)})</span>
            </span>
          </span>
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && bun vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(games\)/games/_components/round-history/RoundHistoryTable.tsx
git commit -m "a11y: add screen-reader text labels for crash point indicators"
```

---

### Task 17: Accessibility — prefers-reduced-motion

**Files:**
- Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: Add reduced motion rules at end of global.css**

Append to `frontend/src/styles/global.css`:

```css
/* ============================================
   ACCESSIBILITY — Reduced Motion
   ============================================ */

@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }

    .animate-glitch,
    .animate-bet-slide-in {
        animation: none !important;
    }

    .glow-cashout,
    .glow-balance-win,
    .glow-balance-lose,
    .glow-chip-high {
        box-shadow: none !important;
        text-shadow: none !important;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/global.css
git commit -m "a11y: add prefers-reduced-motion support for animations"
```

---

### Task 18: Run full test suite + verify build

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
cd frontend && bun vitest run
```

Expected: All tests pass. ~30+ tests across 7 test files.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Verify build**

```bash
cd frontend && bun run build
```

Expected: Build succeeds.

---

## Summary

| Task | Category | Files |
|------|----------|-------|
| 1 | Setup | Install deps |
| 2 | Setup | vitest.config.ts, tests/setup.ts |
| 3 | Setup | tests/helpers.tsx |
| 4 | Test | domain/__tests__/money.test.ts |
| 5 | Test | utils/__tests__/crypto.test.ts |
| 6 | Test | utils/__tests__/helpers.test.ts |
| 7 | Test | store/__tests__/game-store.test.ts |
| 8 | Test | hooks/__tests__/useRoundHistory.test.ts |
| 9 | Test | hooks/__tests__/useMyBets.test.ts |
| 10 | Test | hooks/__tests__/useWallet.test.ts |
| 11 | Test | bets-list/__tests__/BetsList.test.tsx |
| 12 | Perf | BetsList.tsx, CrashGraph.tsx (React.memo) |
| 13 | Perf | Verify selectors (no changes needed) |
| 14 | A11y | CrashGraph.tsx (aria-live) |
| 15 | A11y | VerificationModal.tsx (focus trap + Escape) |
| 16 | A11y | RoundHistoryTable.tsx (sr-only labels) |
| 17 | A11y | global.css (reduced motion) |
| 18 | Verify | Full suite + build check |
