'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSipClient } from '@/hooks/use-sip-client';
import { Phone, PhoneOff, X, Bell } from 'lucide-react';
import { usePush } from '@/components/PushNotificationInit';
import type { SipState, SipActions } from '@/hooks/use-sip-client';

type SipContextType = {
  state: SipState;
  actions: SipActions;
  enabled: boolean;
  dialMethod: string;
};

const noop = () => {};
const defaultActions: SipActions = {
  call: noop, answer: noop, hangup: noop,
  toggleMute: noop, toggleHold: noop, sendDTMF: noop,
};
const defaultState: SipState = {
  registered: false, registering: false, error: null,
  callState: 'idle', callDirection: null, remoteNumber: null,
  remoteRinging: false, muted: false, onHold: false, callStart: null,
};

const SipContext = createContext<SipContextType>({
  state: defaultState,
  actions: defaultActions,
  enabled: false,
  dialMethod: 'sip',
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

function NotificationBanner({ onDismiss }: { onDismiss: () => void }) {
  const { requestAndSubscribe } = usePush();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleEnable() {
    setBusy(true);
    try {
      const ok = await requestAndSubscribe();
      if (ok) { onDismiss(); return; }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[250] animate-in fade-in slide-in-from-top-2 max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-3 bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3 text-sm">
        <Bell size={16} className="text-tc-blue shrink-0" />
        {failed ? (
          <span className="text-gray-700">
            Benachrichtigungen sind blockiert — bitte in den Browser-Einstellungen (Schloss-Symbol in der Adressleiste) erlauben.
          </span>
        ) : (
          <>
            <span className="text-gray-700">Benachrichtigungen für Anrufe aktivieren?</span>
            <button onClick={handleEnable} disabled={busy}
              className="bg-tc-blue text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-tc-blue/90 transition whitespace-nowrap disabled:opacity-50">
              {busy ? 'Aktiviere…' : 'Aktivieren'}
            </button>
          </>
        )}
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default function SipProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [dialMethod, setDialMethod] = useState<string>('sip');
  const [showNotifBanner, setShowNotifBanner] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => { if (data.dialMethod) setDialMethod(data.dialMethod); })
      .catch(() => {});
  }, [status]);

  const enabled = dialMethod === 'sip';
  const { state, actions } = useSipClient(enabled);

  // Show notification banner once when SIP is registered but notifications not granted
  useEffect(() => {
    if (!enabled || !state.registered) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      setShowNotifBanner(true);
    }
  }, [enabled, state.registered]);

  return (
    <SipContext.Provider value={{ state, actions, enabled, dialMethod }}>
      {children}
      <SipStatusToast enabled={enabled} state={state} />
      {showNotifBanner && <NotificationBanner onDismiss={() => setShowNotifBanner(false)} />}
    </SipContext.Provider>
  );
}
