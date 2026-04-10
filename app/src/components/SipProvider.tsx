'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSipClient } from '@/hooks/use-sip-client';
import type { SipState, SipActions } from '@/hooks/use-sip-client';

type SipContextType = {
  state: SipState;
  actions: SipActions;
  enabled: boolean;
};

const noop = () => {};
const defaultActions: SipActions = {
  call: noop, answer: noop, hangup: noop,
  toggleMute: noop, toggleHold: noop, sendDTMF: noop,
};
const defaultState: SipState = {
  registered: false, registering: false, error: null,
  callState: 'idle', callDirection: null, remoteNumber: null,
  muted: false, onHold: false, callStart: null,
};

const SipContext = createContext<SipContextType>({
  state: defaultState,
  actions: defaultActions,
  enabled: false,
});

export function useSip() {
  return useContext(SipContext);
}

export default function SipProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [dialMethod, setDialMethod] = useState<string>('tel');

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => { if (data.dialMethod) setDialMethod(data.dialMethod); })
      .catch(() => {});
  }, [status]);

  const enabled = dialMethod === 'sip';
  const { state, actions } = useSipClient(enabled);

  return (
    <SipContext.Provider value={{ state, actions, enabled }}>
      {children}
    </SipContext.Provider>
  );
}
