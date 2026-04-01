'use client';

import type { UseLeadDetailReturn } from './useLeadDetail';

type Props = {
  state: UseLeadDetailReturn;
};

export default function AISummaryCard({ state }: Props) {
  const { aiSummary, aiError } = state;

  if (!aiSummary && !aiError) return null;

  return (
    <>
      {aiError && (
        <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{aiError}</div>
      )}
      {aiSummary && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3 text-sm">
          <div className="space-y-1">
            {aiSummary.summary.split(' | ').map((point, i) => (
              <p key={i} className="text-gray-800 flex gap-2">
                <span className="text-teal-500 font-bold shrink-0">{i + 1}.</span>
                {point}
              </p>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-teal-100">
            <div>
              <p className="text-teal-700 font-medium text-xs">
                {aiSummary.sentimentEmoji} {aiSummary.sentiment}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">{aiSummary.sentimentExplanation}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400 mb-1">KI-Einschätzung</p>
              <div className="flex items-center gap-1.5">
                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (aiSummary.sentimentScore ?? 5) >= 8 ? 'bg-red-500' :
                      (aiSummary.sentimentScore ?? 5) >= 5 ? 'bg-orange-400' : 'bg-blue-400'
                    }`}
                    style={{ width: `${((aiSummary.sentimentScore ?? 5) / 10) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-700">{aiSummary.sentimentScore}/10</span>
              </div>
            </div>
          </div>
          {aiSummary.temperatureSuggestion && (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 border text-xs ${
              aiSummary.temperatureSuggestion === 'hot'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-orange-50 border-orange-200 text-orange-700'
            }`}>
              <span className="text-base leading-none">
                {aiSummary.temperatureSuggestion === 'hot' ? '\uD83D\uDD25' : '\uD83C\uDF24\uFE0F'}
              </span>
              <div>
                <p className="font-semibold">
                  KI schlägt vor: Lead auf {aiSummary.temperatureSuggestion === 'hot' ? 'Heiß' : 'Warm'} setzen
                </p>
                {aiSummary.temperatureSuggestionReason && (
                  <p className="mt-0.5 opacity-80">{aiSummary.temperatureSuggestionReason}</p>
                )}
              </div>
            </div>
          )}
          <div className="bg-white rounded-lg p-3 border border-teal-100">
            <p className="text-xs text-gray-500 font-medium mb-1">Empfohlener nächster Schritt</p>
            <p className="text-gray-800">{aiSummary.nextAction}</p>
          </div>
        </div>
      )}
    </>
  );
}
