'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

/** Register SW and auto-resubscribe if permission already granted. */
export function usePushNotifications() {
  const { data: session } = useSession();
  const subscribedRef = useRef(false);

  useEffect(() => {
    // Register the SW whenever supported — call notifications (showNotification)
    // need a registration even on browsers without PushManager
    if (!session || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      // Auto-resubscribe if permission already granted
      if ('PushManager' in window && Notification.permission === 'granted' && !subscribedRef.current) {
        subscribedRef.current = true;
        await subscribeWithReg(reg);
      }
    }).catch(() => {});
  }, [session]);

  /** Request permission and subscribe. Call this on user action (e.g. task creation). */
  const requestAndSubscribe = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'denied') return false;

    // requestPermission must be the first await to keep the user gesture alive
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Push subscription is best-effort: the granted permission alone already
    // enables SIP call notifications. Never let a hanging SW block the UI.
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
        ]);
        if (reg) await subscribeWithReg(reg);
      } catch {
        // silent — permission is granted, only background push is unavailable
      }
    }
    return true;
  }, []);

  return { requestAndSubscribe, supported: typeof window !== 'undefined' && 'PushManager' in window };
}

async function subscribeWithReg(reg: ServiceWorkerRegistration) {
  try {
    const res = await fetch('/api/push/vapid-public-key');
    if (!res.ok) return;
    const { publicKey } = await res.json();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch {
    // Subscription failed — silent, don't break the app
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}
