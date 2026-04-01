'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Phone, PhoneIncoming, PhoneOff, PhoneOutgoing, X } from 'lucide-react';

type CallEvent = {
  type: 'ring' | 'connect' | 'disconnect';
  direction: 'incoming' | 'outgoing';
  externalNumber: string;
  duration?: number;
  leadId?: string;
  leadName?: string;
};

type ActiveCall = CallEvent & { visible: boolean };

export default function CallPopup() {
  const { status } = useSession();
  const [call, setCall] = useState<ActiveCall | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let es: EventSource | null = null;
    let retryTimer: NodeJS.Timeout;

    function connect() {
      es = new EventSource('/callmonitor/events');

      es.onmessage = (e) => {
        try {
          const event: CallEvent = JSON.parse(e.data);
          if (event.type === 'ring') {
            setCall({ ...event, visible: true });
          } else if (event.type === 'connect') {
            setCall(prev => prev ? { ...prev, ...event, type: 'connect' } : null);
          } else if (event.type === 'disconnect') {
            // Notify open modals to refresh
            window.dispatchEvent(new CustomEvent('call-ended', { detail: event }));
            setCall(prev => {
              if (!prev) return null;
              setTimeout(() => setCall(null), 4000);
              return { ...prev, ...event, type: 'disconnect' };
            });
          }
        } catch {}
      };

      es.onerror = () => {
        es?.close();
        es = null;
        retryTimer = setTimeout(connect, 10_000);
      };
    }

    connect();
    return () => { es?.close(); clearTimeout(retryTimer); };
  }, [status]);

  if (!call?.visible) return null;

  const isConnected = call.type === 'connect';
  const isDisconnected = call.type === 'disconnect';
  const displayName = call.leadName || call.externalNumber || 'Unbekannt';

  return (
    <div className="fixed bottom-6 right-6 z-[300]">
      <div className={`rounded-2xl shadow-2xl border p-4 min-w-[280px] ${
        isDisconnected ? 'bg-gray-50 border-gray-200' :
        isConnected ? 'bg-green-50 border-green-200' :
        call.direction === 'incoming' ? 'bg-tc-blue/10 border-tc-blue/30' : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${
              isDisconnected ? 'bg-gray-200' :
              isConnected ? 'bg-green-200' :
              call.direction === 'incoming' ? 'bg-tc-blue/20 animate-pulse' : 'bg-amber-200'
            }`}>
              {isDisconnected ? <PhoneOff size={18} className="text-gray-500" /> :
               isConnected ? <Phone size={18} className="text-green-600" /> :
               call.direction === 'incoming' ? <PhoneIncoming size={18} className="text-tc-blue" /> :
               <PhoneOutgoing size={18} className="text-amber-600" />}
            </div>
            <div>
              <p className="text-xs text-gray-500">
                {isDisconnected ? 'Anruf beendet' :
                 isConnected ? 'Verbunden' :
                 call.direction === 'incoming' ? 'Eingehender Anruf' : 'Ausgehender Anruf'}
              </p>
              <p className="text-sm font-semibold text-gray-900">{displayName}</p>
              {call.leadName && call.externalNumber && (
                <p className="text-xs text-gray-400">{call.externalNumber}</p>
              )}
              {isDisconnected && call.duration !== undefined && call.duration > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">{Math.floor(call.duration / 60)}:{String(call.duration % 60).padStart(2, '0')} min</p>
              )}
            </div>
          </div>
          <button onClick={() => setCall(null)} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
