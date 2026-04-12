'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

/** Register SW and auto-resubscribe if permission already granted. */
export function usePushNotifications() {
  const { data: session } = useSession();
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!session || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      // Auto-resubscribe if permission already granted
      if (Notification.permission === 'granted' && !subscribedRef.current) {
        subscribedRef.current = true;
        await subscribeWithReg(reg);
      }
    });
  }, [session]);

  /** Request permission and subscribe. Call this on user action (e.g. task creation). */
  const requestAndSubscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    await subscribeWithReg(reg);
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
