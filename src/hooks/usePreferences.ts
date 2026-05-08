import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export interface UserPreferences {
  theme: 'dark' | 'light';
  notificationsEnabled: boolean;
  compactView: boolean;
}

const defaultPrefs: UserPreferences = {
  theme: 'dark',
  notificationsEnabled: true,
  compactView: false,
};

export const usePreferences = () => {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPrefs);
  const [isLoaded, setIsLoaded] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // 1. Try to load from LocalStorage first (instant paint)
    const localPrefs = localStorage.getItem('celsor_prefs');
    if (localPrefs) {
      setPreferences(JSON.parse(localPrefs));
      setIsLoaded(true);
    }

    // 2. Fetch from Supabase via API Gateway to sync across devices
    const syncPreferences = async () => {
      if (typeof window !== 'undefined' && localStorage.getItem('celsor_demo_bypass') === 'true') {
        setIsLoaded(true);
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const { data } = await supabase.table("profiles").select("preferences").eq("id", session.user.id).single();
        if (data && data.preferences) {
          const remotePrefs = data.preferences as UserPreferences;
          setPreferences(remotePrefs);
          localStorage.setItem('celsor_prefs', JSON.stringify(remotePrefs));
        }
        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to sync preferences", error);
      }
    };

    syncPreferences();
  }, [supabase]);

  const updatePreference = async (newPrefs: Partial<UserPreferences>) => {
    const updated = { ...preferences, ...newPrefs };
    
    // 1. Optimistic local update
    setPreferences(updated);
    localStorage.setItem('celsor_prefs', JSON.stringify(updated));

    // 2. Sync to API Gateway
    if (typeof window !== 'undefined' && localStorage.getItem('celsor_demo_bypass') === 'true') {
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      fetch('http://localhost:8000/api/v1/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(updated),
      }).catch(err => console.error("Failed to save preferences remote", err));
    }
  };

  return { preferences, updatePreference, isLoaded };
};
