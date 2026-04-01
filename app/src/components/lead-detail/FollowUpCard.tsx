'use client';

import { Send, X } from 'lucide-react';
import type { LeadFull } from './types';
import type { UseLeadDetailReturn } from './useLeadDetail';

type Props = {
  lead: LeadFull;
  state: UseLeadDetailReturn;
};

export default function FollowUpCard({ lead, state }: Props) {
  const { followUp, setFollowUp, followUpError, sendFollowUp, discardFollowUp, copied, copyToClipboard } = state;

  if (!followUp) return null;

  return (
    <div className="bg-tc-blue/10 border border-tc-blue/30 rounded-xl p-4 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-tc-dark uppercase tracking-wide">Follow-Up E-Mail</p>
        <button onClick={() => copyToClipboard(`Betreff: ${followUp.subject}\n\n${followUp.body}`)}
          className="text-xs text-tc-blue hover:text-tc-dark">{copied ? 'Kopiert!' : 'Kopieren'}</button>
      </div>
      <input
        value={followUp.subject}
        onChange={e => setFollowUp({ ...followUp, subject: e.target.value })}
        className="w-full border border-tc-blue/20 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tc-blue"
        placeholder="Betreff"
      />
      <textarea
        value={followUp.body}
        onChange={e => setFollowUp({ ...followUp, body: e.target.value })}
        rows={6}
        className="w-full border border-tc-blue/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none leading-relaxed"
      />
      {followUpError && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{followUpError}</div>}
      <div className="flex items-center gap-2">
        {lead.email ? (
          <button
            onClick={sendFollowUp}
            className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <Send size={14} /> An {lead.email} senden
          </button>
        ) : (
          <p className="text-xs text-gray-400">Keine E-Mail-Adresse hinterlegt</p>
        )}
        <button
          onClick={discardFollowUp}
          className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:border-red-200 transition"
        >
          <X size={14} /> Verwerfen
        </button>
      </div>
    </div>
  );
}
