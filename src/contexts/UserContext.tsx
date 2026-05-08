'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserPreferences {
  chains: string[];
  minConvictionScore: number;
  emailAlertsEnabled: boolean;
  pushAlertsEnabled: boolean;
  alertThreshold: number;
  watchedTokens: string[];
}

export interface CelsorUser {
  id: string;
  email: string;
  plan: 'free' | 'basic' | 'pro';
  permissions: string[];
  preferences: UserPreferences;
  signalsToday: number;
  createdAt: string;
}

interface UserContextValue {
  user: CelsorUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  can: (permission: string) => boolean;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: UserPreferences = {
  chains: ['eth', 'arb', 'base', 'bsc', 'op'],
  minConvictionScore: 50,
  emailAlertsEnabled: false,
  pushAlertsEnabled: false,
  alertThreshold: 75,
  watchedTokens: [],
};

// ─── Context ──────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  isAuthenticated: false,
  can: () => false,
  updatePreferences: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CelsorUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.user) {
          setUser({
            ...data.user,
            preferences: { ...DEFAULT_PREFERENCES, ...data.user.preferences },
          });
        }
      }
    } catch {
      // Not authenticated or network error
    } finally {
      setLoading(false);
    }
  }

  function can(permission: string): boolean {
    if (!user) return false;
    return user.permissions.includes(permission);
  }

  async function updatePreferences(prefs: Partial<UserPreferences>) {
    if (!user) return;

    const updated = { ...user.preferences, ...prefs };
    setUser(prev => prev ? { ...prev, preferences: updated } : null);

    try {
      await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: updated }),
      });
    } catch (e) {
      console.error('[UserContext] Failed to persist preferences:', e);
    }
  }

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        can,
        updatePreferences,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

export function useCan(permission: string) {
  const { can } = useContext(UserContext);
  return can(permission);
}
