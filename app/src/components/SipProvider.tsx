'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSipClient } from '@/hooks/use-sip-client';
import { Phone, PhoneOff, X } from 'lucide-react';
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

type Toast = { message: string; type: 'success' | 'error' };

function SipStatusToast({ enabled, state }: { enabled: boolean; state: SipState }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const prevState = useRef({ registered: false, error: null as string | null });

  useEffect(() => {
    if (!enabled) return;

    const prev = prevState.current;

    // Registered
    if (state.registered && !prev.registered) {
      setToast({ message: 'SIP verbunden', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    }

    // Error
    if (state.error && state.error !== prev.error) {
      setToast({ message: state.error, type: 'error' });
      // Don't auto-dismiss errors
    }

    // Disconnected (was registered, now not)
    if (!state.registered && prev.registered && !state.registering) {
      setToast({ message: 'SIP getrennt', type: 'error' });
    }

    prevState.current = { registered: state.registered, error: state.error };
  }, [enabled, state.registered, state.error, state.registering]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[250] animate-in fade-in slide-in-from-bottom-2">
      <div className={`flex items-center gap-2 rounded-xl shadow-lg border px-4 py-3 text-sm ${
        toast.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}>
        {toast.type === 'success'
          ? <Phone size={14} />
          : <PhoneOff size={14} />}
        <span>{toast.message}</span>
        <button onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default function SipProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [dialMethod, setDialMethod] = useState<string>('sip');

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
      <SipStatusToast enabled={enabled} state={state} />
    </SipContext.Provider>
  );
}
