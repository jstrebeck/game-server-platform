'use client';

import { createContext, useContext, ReactNode } from 'react';

interface AccessTokenContextType {
  getAccessToken: () => Promise<string | null>;
}

const AccessTokenContext = createContext<AccessTokenContextType | undefined>(undefined);

export function AccessTokenProvider({ children }: { children: ReactNode }) {
  async function getAccessToken(): Promise<string | null> {
    try {
      const res = await fetch('/api/auth/session');
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
