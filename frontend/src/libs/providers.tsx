'use client';

/**
 * App Providers - Wrap application with context providers
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { getQueryClient } from './get-query-client';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

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
