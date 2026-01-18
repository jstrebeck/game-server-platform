'use client';

import { createContext, useContext, ReactNode } from 'react';

interface AccessTokenContextType {
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AccessTokenContext = createContext<AccessTokenContextType | undefined>(undefined);

export function AccessTokenProvider({ children }: { children: ReactNode }) {
  async function getAccessToken(forceRefresh: boolean = false): Promise<string | null> {
    try {
      // Add cache-busting parameter when forcing refresh
      const url = forceRefresh
        ? `/api/auth/session?refresh=${Date.now()}`
        : '/api/auth/session';

      const res = await fetch(url, {
        cache: forceRefresh ? 'no-store' : 'default',
      });

      if (res.ok) {
        const data = await res.json();
        return data.accessToken || null;
      }
    } catch (error) {
      console.error('Error fetching access token:', error);
    }
    return null;
  }

  return (
    <AccessTokenContext.Provider value={{ getAccessToken }}>
      {children}
    </AccessTokenContext.Provider>
  );
}

export function useAccessToken() {
  const context = useContext(AccessTokenContext);
  if (context === undefined) {
    throw new Error('useAccessToken must be used within an AccessTokenProvider');
  }
  return context;
}
