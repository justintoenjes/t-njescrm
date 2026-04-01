'use client';

import type { UseLeadDetailReturn } from './useLeadDetail';

type Props = {
  state: UseLeadDetailReturn;
};

export default function ReachabilitySection({ state }: Props) {
  const { missedCallsCount, noShowCount, triggerAction } = state;

  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Erreichbarkeit</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => triggerAction('missedCall')}
          className="flex items-center gap-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg transition"
        >
          Anruf nicht erreicht
          {missedCallsCount > 0 && (
            <span className="bg-amber-200 text-amber-800 rounded-full px-1.5 py-0.5 text-[11px] font-bold">
              {missedCallsCount}
            </span>
          )}
        </button>
        <button
          onClick={() => triggerAction('noShow')}
          className="flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg transition"
        >
          Termin verpasst
          {noShowCount > 0 && (
            <span className="bg-red-200 text-red-800 rounded-full px-1.5 py-0.5 text-[11px] font-bold">
              {noShowCount}
            </span>
          )}
        </button>
      </div>
      {(missedCallsCount > 0 || noShowCount > 0) && (
        <p className="text-[11px] text-gray-400">
          Verpasste Anrufe und No-Shows senken den Score. Reset bei Notiz mit &bdquo;Kontakt hergestellt&ldquo;.
        </p>
      )}
    </div>
  );
}
