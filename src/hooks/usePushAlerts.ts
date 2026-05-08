'use client';

import { useEffect, useRef } from 'react';

interface WhaleAlert {
  type: 'whale_tx' | 'new_wallet' | 'anomaly';
  title: string;
  body: string;
  url?: string;
}

// Request push notification permission and send alerts
export function usePushNotifications() {
  const permissionRef = useRef<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    permissionRef.current = Notification.permission;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { permissionRef.current = p; });
    }
  }, []);

  const sendAlert = (alert: WhaleAlert) => {
    if (permissionRef.current !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(sw => {
      sw.showNotification(alert.title, {
        body: alert.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: alert.type,
        data: { url: alert.url ?? '/dashboard/wallets' },
      });
    });
  };

  return { sendAlert };
}

// Hook: poll engine/scan and fire alerts on new wallets
export function useAutonomousAlerts(onNewWallet?: (count: number) => void) {
  const { sendAlert } = usePushNotifications();
  const knownWallets = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/engine/scan');
        const data = await res.json();
        const watchlist: Array<{ address: string; tokenTrigger: string; convictionScore: number; reason: string }> =
          data.watchlist ?? [];

        const newOnes = watchlist.filter(w => !knownWallets.current.has(w.address));
        newOnes.forEach(w => {
          knownWallets.current.add(w.address);
          // Fire push alert for each newly discovered wallet
          sendAlert({
            type: 'new_wallet',
            title: `🐋 New Wallet Detected — ${w.tokenTrigger}`,
            body: `${w.reason} · Conviction: ${w.convictionScore}`,
            url: '/dashboard/wallets',
          });
        });

        if (newOnes.length > 0) onNewWallet?.(newOnes.length);
      } catch { /* silent */ }
    };

    check();
    const t = setInterval(check, 60_000); // poll every 60s
    return () => clearInterval(t);
  }, [sendAlert, onNewWallet]);
}
