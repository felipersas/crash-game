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
  });
}

// next-auth Session type requires `expires` (from DefaultSession) plus the
// augmented fields in next-auth.d.ts. The setup.ts mock controls what
// useSession actually returns at runtime.
const testSession = {
  accessToken: 'test-token',
  playerId: 'player-1',
  user: { playerId: 'player-1', username: 'testplayer' },
  expires: new Date(Date.now() + 86_400_000).toISOString(),
} as const;

interface WrapperProps {
  children: ReactNode;
}

export function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: WrapperProps) {
    return (
      <SessionProvider session={testSession}>
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

export function renderHookWithProviders<TResult>(hook: () => TResult) {
  const Wrapper = createWrapper();
  return renderHook(hook, { wrapper: Wrapper });
}

// Re-export everything from RTL for convenience
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
