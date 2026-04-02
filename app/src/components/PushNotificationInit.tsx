'use client';

import { createContext, useContext } from 'react';
import { usePushNotifications } from '@/lib/use-push-notifications';

type PushContextType = { requestAndSubscribe: () => Promise<boolean> };
const PushContext = createContext<PushContextType>({ requestAndSubscribe: async () => false });

export function usePush() {
  return useContext(PushContext);
}

/** Registers SW and provides push subscription context to children. */
export default function PushNotificationProvider({ children }: { children: React.ReactNode }) {
  const { requestAndSubscribe } = usePushNotifications();
  return (
    <PushContext.Provider value={{ requestAndSubscribe }}>
      {children}
    </PushContext.Provider>
  );
}
