'use client';

import { useState, useRef, useEffect } from 'react';
import type { ScoreBreakdown } from '@/lib/lead-score';

type Props = {
  score: number;
  breakdown: ScoreBreakdown;
  colorClass: string;
  children: React.ReactNode;
};

const ROWS: { key: keyof Omit<ScoreBreakdown, 'total'>; name: string; max: string }[] = [
  { key: 'contactRecency', name: 'Kontakt-Aktivität', max: '30' },
  { key: 'opportunity', name: 'Opportunities', max: '30' },
  { key: 'aiSentiment', name: 'KI-Sentiment', max: '15' },
  { key: 'engagement', name: 'Engagement', max: '-10' },
  { key: 'phaseBonus', name: 'Phase-Bonus', max: '15' },
];

export default function ScoreBreakdownPopover({ score, breakdown, colorClass, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.max(8, rect.left) });
    }
    setOpen(!open);
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="cursor-pointer"
        title="Score-Details anzeigen"
      >
        {children}
      </button>
      {open && (
        <div
          ref={ref}
          className="fixed z-[200] bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800">Score-Aufschlüsselung</p>
            <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full border ${colorClass}`}>
              {score}
            </span>
          </div>
          <div className="space-y-2">
            {ROWS.map(({ key, name, max }) => {
              const item = breakdown[key];
              const isNegative = item.points < 0;
              return (
                <div key={key} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">{name}</span>
                      <span className={`text-xs font-bold tabular-nums ${isNegative ? 'text-red-600' : item.points > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                        {isNegative ? '' : '+'}{item.points}
                        <span className="text-gray-300 font-normal"> / {max}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">{item.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-500">Gesamt</span>
            <span className="text-sm font-bold text-gray-800">{breakdown.total}</span>
          </div>
        </div>
      )}
    </div>
  );
}
