'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Phone, PhoneIncoming, PhoneOff, PhoneOutgoing, X, Mic, MicOff, Pause, Play, Grid3X3 } from 'lucide-react';
import { useSip } from '@/components/SipProvider';

type CallEvent = {
  type: 'ring' | 'connect' | 'disconnect';
  direction: 'incoming' | 'outgoing';
  externalNumber: string;
  duration?: number;
  leadId?: string;
  leadName?: string;
};

type ActiveCall = CallEvent & { visible: boolean };

function normalizeNumber(n: string): string {
  return n.replace(/[\s\-()]/g, '').replace(/^\+49/, '0');
}

function CallDuration({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  return <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>;
}

function DTMFPad({ onTone }: { onTone: (tone: string) => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','*','0','#'];
  return (
    <div className="grid grid-cols-3 gap-1 mt-2">
      {keys.map(k => (
        <button key={k} onClick={() => onTone(k)}
          className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 transition">
          {k}
        </button>
      ))}
    </div>
  );
}

export default function CallPopup() {
  const { status } = useSession();
  const { state: sip, actions: sipActions, enabled: sipEnabled } = useSip();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [showDTMF, setShowDTMF] = useState(false);

  // SSE callmonitor events
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

  // Lead lookup for SIP calls via CRM search API
  const [sipLeadName, setSipLeadName] = useState<string | null>(null);
  const sipActive = sipEnabled && sip.callState !== 'idle';

  useEffect(() => {
    if (!sip.remoteNumber || sip.callState === 'idle') { setSipLeadName(null); return; }
    const num = sip.remoteNumber;
    fetch(`/api/search?q=${encodeURIComponent(num)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.leads?.length) return;
        const l = data.leads[0];
        const name = [l.lastName, l.firstName].filter(Boolean).join(', ');
        if (name) setSipLeadName(name);
      })
      .catch(() => {});
  }, [sip.remoteNumber, sip.callState]);

  // Deduplicate
  const sipNumber = sip.remoteNumber ? normalizeNumber(sip.remoteNumber) : null;
  const sseNumber = call?.externalNumber ? normalizeNumber(call.externalNumber) : null;
  const sipHandlingThisCall = sipActive && sipNumber && sseNumber && (sipNumber === sseNumber || sipNumber.endsWith(sseNumber) || sseNumber.endsWith(sipNumber));

  // SIP call popup
  if (sipActive) {
    const isRinging = sip.callState === 'ringing';
    const isConnected = sip.callState === 'connected';
    const isCalling = sip.callState === 'calling';
    const displayName = sipLeadName || sip.remoteNumber || 'Unbekannt';

    return (
      <div className="fixed bottom-6 right-6 z-[300]">
        <div className={`rounded-2xl shadow-2xl border p-4 min-w-[280px] ${
          isConnected ? 'bg-green-50 border-green-200' :
          isRinging && sip.callDirection === 'incoming' ? 'bg-white border-tc-blue shadow-tc-blue/20' :
          'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${
                isConnected ? 'bg-green-200' :
                isRinging && sip.callDirection === 'incoming' ? 'bg-tc-blue/20 animate-pulse' :
                'bg-amber-200'
              }`}>
                {isConnected ? <Phone size={18} className="text-green-600" /> :
                 sip.callDirection === 'incoming' ? <PhoneIncoming size={18} className="text-tc-blue" /> :
                 <PhoneOutgoing size={18} className="text-amber-600" />}
              </div>
              <div>
                <p className="text-xs text-gray-500">
                  {isConnected ? (sip.onHold ? 'Gehalten' : 'Verbunden') :
                   isRinging && sip.callDirection === 'incoming' ? 'Eingehender Anruf' :
                   isCalling ? 'Wählt...' : 'Anruf'}
                </p>
                <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                {sipLeadName && sip.remoteNumber && (
                  <p className="text-xs text-gray-400">{sip.remoteNumber}</p>
                )}
                {isConnected && sip.callStart && (
                  <p className="text-xs text-gray-400 mt-0.5"><CallDuration startTime={sip.callStart} /></p>
                )}
              </div>
            </div>
          </div>

          {/* Call Controls */}
          <div className="flex items-center gap-2 mt-3">
            {/* Incoming: Answer + Reject */}
            {isRinging && sip.callDirection === 'incoming' && (
              <>
                <button onClick={() => { console.log('[SIP] Answer clicked'); sipActions.answer(); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-2.5 rounded-lg transition">
                  <Phone size={14} /> Annehmen
                </button>
                <button onClick={() => { console.log('[SIP] Reject clicked'); sipActions.hangup(); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2.5 rounded-lg transition">
                  <PhoneOff size={14} /> Ablehnen
                </button>
              </>
            )}

            {/* Connected: Mute, Hold, DTMF, Hangup */}
            {isConnected && (
              <>
                <button onClick={sipActions.toggleMute}
                  className={`p-2 rounded-lg border transition ${sip.muted ? 'bg-red-100 border-red-300 text-red-600' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'}`}
                  title={sip.muted ? 'Stummschaltung aufheben' : 'Stummschalten'}>
                  {sip.muted ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <button onClick={sipActions.toggleHold}
                  className={`p-2 rounded-lg border transition ${sip.onHold ? 'bg-amber-100 border-amber-300 text-amber-600' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'}`}
                  title={sip.onHold ? 'Fortsetzen' : 'Halten'}>
                  {sip.onHold ? <Play size={16} /> : <Pause size={16} />}
                </button>
                <button onClick={() => setShowDTMF(!showDTMF)}
                  className={`p-2 rounded-lg border transition ${showDTMF ? 'bg-tc-blue/10 border-tc-blue/30 text-tc-blue' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'}`}
                  title="Tastatur">
                  <Grid3X3 size={16} />
                </button>
                <button onClick={sipActions.hangup}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 rounded-lg transition">
                  <PhoneOff size={14} /> Auflegen
                </button>
              </>
            )}

            {/* Calling: Cancel */}
            {isCalling && (
              <button onClick={sipActions.hangup}
                className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 rounded-lg transition">
                <PhoneOff size={14} /> Abbrechen
              </button>
            )}
          </div>

          {/* DTMF Pad */}
          {showDTMF && isConnected && (
            <DTMFPad onTone={sipActions.sendDTMF} />
          )}
        </div>
      </div>
    );
  }

  // SSE-based popup (original) — suppress if SIP is handling the same call
  if (!call?.visible || sipHandlingThisCall) return null;

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
