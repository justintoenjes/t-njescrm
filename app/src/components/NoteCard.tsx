'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Trash } from 'lucide-react';
import { NoteContent } from './NoteContent';

type NoteSource = {
  type: 'lead' | 'opportunity';
  label: string;
  id: string;
};

type MoveTarget = NoteSource;

type Props = {
  note: {
    id: string;
    content: string;
    isAiGenerated?: boolean;
    createdAt: string;
    author: { id: string; name: string } | null;
  };
  source: NoteSource;
  moveTargets: MoveTarget[];
  onMove: (noteId: string, target: { leadId?: string; opportunityId?: string }) => Promise<void>;
  onDelete?: (noteId: string) => void;
  formatDate: (date: string) => string;
};

const SOURCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  lead: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
};

// Deterministic color based on string hash
const OPP_COLORS = [
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-400' },
  { bg: 'bg-tc-blue/20', text: 'text-tc-dark', border: 'border-tc-blue/30', dot: 'bg-blue-400' },
  { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-400' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-400' },
  { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-400' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-400' },
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-400' },
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getOppColor(id: string) {
  return OPP_COLORS[hashCode(id) % OPP_COLORS.length];
}

export default function NoteCard({ note, source, moveTargets, onMove, onDelete, formatDate }: Props) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isLead = source.type === 'lead';
  const sourceColor = isLead ? SOURCE_COLORS.lead : getOppColor(source.id);
  const hasMoveTargets = moveTargets.length > 1; // More than just the current source

  async function handleMove(target: MoveTarget) {
    if (target.id === source.id) { setOpen(false); return; }
    setMoving(true);
    await onMove(note.id, target.type === 'lead' ? { leadId: target.id } : { opportunityId: target.id });
    setMoving(false);
    setOpen(false);
  }

  return (
    <div className={`group relative rounded-lg px-4 py-3 ${note.isAiGenerated ? 'bg-tc-blue/10 border border-tc-blue/20' : 'bg-gray-50'}`}>
      {onDelete && (
        <button
          onClick={() => { if (confirm('Notiz wirklich löschen?')) onDelete(note.id); }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition p-1 rounded"
          title="Löschen"
        >
          <Trash size={13} />
        </button>
      )}
      <div className="flex items-center gap-2 mb-1.5">
        {/* Source label / move dropdown */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => hasMoveTargets && setOpen(!open)}
            disabled={moving}
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition
              ${sourceColor.bg} ${sourceColor.text} ${sourceColor.border}
              ${hasMoveTargets ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
          >
            {!isLead && <span className={`w-1.5 h-1.5 rounded-full ${(sourceColor as typeof OPP_COLORS[0]).dot}`} />}
            <span className="truncate max-w-[150px]">{source.label}</span>
            {hasMoveTargets && <ChevronDown size={10} className={`transition ${open ? 'rotate-180' : ''}`} />}
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]">
              {moveTargets.map((target) => {
                const isCurrent = target.id === source.id;
                const color = target.type === 'lead' ? SOURCE_COLORS.lead : getOppColor(target.id);
                return (
                  <button
                    key={target.id}
                    onClick={() => handleMove(target)}
                    disabled={isCurrent}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition
                      ${isCurrent ? 'bg-gray-50 text-gray-400 cursor-default' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    {target.type === 'opportunity' && (
                      <span className={`w-2 h-2 rounded-full shrink-0 ${(color as typeof OPP_COLORS[0]).dot}`} />
                    )}
                    {target.type === 'lead' && (
                      <span className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
                    )}
                    <span className="truncate">{target.label}</span>
                    {isCurrent && <Check size={12} className="ml-auto text-green-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {note.isAiGenerated && (
          <span className="text-[11px] font-semibold text-tc-blue uppercase tracking-wide">KI</span>
        )}
      </div>

      <NoteContent content={note.content} />
      <p className="text-xs text-gray-400 mt-1.5">
        {note.author?.name && <span className="font-medium text-gray-500">{note.author.name} · </span>}
        {formatDate(note.createdAt)}
      </p>
    </div>
  );
}
