/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';

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
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
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

// Mock API layer — individual tests override with vi.mocked()
vi.mock('@/libs/axios', () => ({
  get: vi.fn(),
  post: vi.fn(),
  apiClient: {
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  },
}));

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
