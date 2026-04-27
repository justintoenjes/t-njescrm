'use client';

import { Phone } from 'lucide-react';
import { useSip } from '@/components/SipProvider';

type Props = {
  number: string;
  size?: number;
  className?: string;
};

export default function DialButton({ number, size = 14, className = '' }: Props) {
  const { actions: sipActions, state: sipState, dialMethod } = useSip();

  if (!number) return null;

  const baseClass = `shrink-0 px-2.5 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg transition disabled:opacity-50 ${className}`;

  if (dialMethod === 'sip') {
    return (
      <button
        type="button"
        onClick={() => sipActions.call(number)}
        disabled={sipState.callState !== 'idle' || !sipState.registered}
        className={baseClass}
        title={sipState.registered ? 'Anrufen (Browser SIP)' : 'SIP nicht verbunden'}
      >
        <Phone size={size} />
      </button>
    );
  }

  if (dialMethod === 'fritzbox') {
    return (
      <button
        type="button"
        onClick={async () => {
          try {
            const res = await fetch('/callmonitor/dial', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number }),
            });
            const data = await res.json();
            if (!res.ok) alert(data.error ?? 'Fehler');
          } catch { alert('Callmonitor nicht erreichbar'); }
        }}
        className={baseClass}
        title="Anrufen (Fritz!Box)"
      >
        <Phone size={size} />
      </button>
    );
  }

  return (
    <a
      href={`tel:${number}`}
      className={`${baseClass} inline-flex items-center`}
      title="Anrufen (Telefonie-App)"
    >
      <Phone size={size} />
    </a>
  );
}
