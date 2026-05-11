'use client';

/**
 * App Providers - Wrap application with context providers
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { ReactNode, useState } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            gcTime: 300000,
            retry: (failureCount, error) => {
              const apiError = error as { status?: number };
              if (apiError.status && apiError.status >= 400 && apiError.status < 500) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="top-center"
          theme="dark"
          richColors
          closeButton
          duration={4000}
          toastOptions={{
            classNames: {
              toast: 'cyber-toast',
              title: 'cyber-toast-title',
              description: 'cyber-toast-description',
              actionButton: 'cyber-toast-action',
              cancelButton: 'cyber-toast-cancel',
              closeButton: 'cyber-toast-close',
            },
          }}
        />
      </QueryClientProvider>
    </SessionProvider>
  );
}
