'use client';

import type { TimelineFilter } from './types';

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'notes', label: 'Notizen' },
  { key: 'emails', label: 'E-Mails' },
  { key: 'calls', label: 'Anrufe' },
];

type Props = {
  active: TimelineFilter;
  onChange: (filter: TimelineFilter) => void;
  counts: Record<TimelineFilter, number>;
};

export default function TimelineFilters({ active, onChange, counts }: Props) {
  return (
    <div className="flex gap-1">
      {FILTERS.map(f => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition
            ${active === f.key
              ? 'bg-tc-dark text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {f.label}
          {counts[f.key] > 0 && (
            <span className={`ml-1.5 ${active === f.key ? 'text-white/70' : 'text-gray-400'}`}>
              {counts[f.key]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
