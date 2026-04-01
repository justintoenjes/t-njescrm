'use client';

import { useState } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import type { NoteTarget } from './types';

type Props = {
  targets: NoteTarget[];
  onAddNote: (content: string, target: NoteTarget) => Promise<void>;
};

export default function GroupNoteInput({ targets, onAddNote }: Props) {
  const [text, setText] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<NoteTarget>(targets[0]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleAdd() {
    if (!text.trim() || !selectedTarget) return;
    setAdding(true);
    await onAddNote(text.trim(), selectedTarget);
    setText('');
    setAdding(false);
  }

  if (targets.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAdd(); }}
          placeholder="Neue Notiz… (Strg+Enter)"
          rows={2}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !text.trim()}
          className="self-end bg-tc-dark hover:bg-tc-dark/90 text-white p-2.5 rounded-lg transition disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>

      {targets.length > 1 && (
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition"
          >
            <span className="truncate max-w-[200px]">
              Ziel: {selectedTarget?.label ?? 'Auswählen'}
            </span>
            <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[220px] max-h-48 overflow-y-auto">
              {targets.map((t) => (
                <button
                  key={`${t.type}-${t.id}`}
                  onClick={() => { setSelectedTarget(t); setOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition flex items-center gap-2
                    ${selectedTarget?.id === t.id ? 'bg-gray-50 font-medium' : ''}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${t.type === 'lead' ? 'bg-gray-400' : 'bg-purple-400'}`} />
                  <span className="truncate">{t.label}</span>
                  <span className="text-gray-400 ml-auto shrink-0">
                    {t.type === 'lead' ? 'Kontakt' : 'Opp'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
