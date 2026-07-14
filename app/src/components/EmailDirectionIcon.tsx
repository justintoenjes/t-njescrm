import { Mail, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

type Props = { direction: 'INBOUND' | 'OUTBOUND' };

// Envelope with a direction arrow: incoming = green arrow pointing in (bottom left),
// outgoing = blue arrow pointing out (top right)
export default function EmailDirectionIcon({ direction }: Props) {
  const isIncoming = direction === 'INBOUND';
  return (
    <div
      className={`relative w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isIncoming ? 'bg-green-100' : 'bg-blue-100'}`}
      title={isIncoming ? 'Eingehende E-Mail' : 'Ausgehende E-Mail'}
    >
      <Mail size={14} className={isIncoming ? 'text-green-600' : 'text-blue-600'} />
      {isIncoming ? (
        <span className="absolute -bottom-0.5 -left-0.5 bg-white rounded-full flex">
          <ArrowDownLeft size={11} strokeWidth={3} className="text-green-600" />
        </span>
      ) : (
        <span className="absolute -top-0.5 -right-0.5 bg-white rounded-full flex">
          <ArrowUpRight size={11} strokeWidth={3} className="text-blue-600" />
        </span>
      )}
    </div>
  );
}

export function EmailDirectionLabel({ direction }: Props) {
  const isIncoming = direction === 'INBOUND';
  return (
    <span className={`text-[11px] font-medium px-1.5 py-px rounded-full shrink-0 ${isIncoming ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
      {isIncoming ? 'Eingang' : 'Ausgang'}
    </span>
  );
}
