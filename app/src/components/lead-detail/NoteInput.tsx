'use client';

import { Send } from 'lucide-react';
import type { UseLeadDetailReturn } from './useLeadDetail';

type Props = {
  state: UseLeadDetailReturn;
};

export default function NoteInput({ state }: Props) {
  const { noteText, setNoteText, addingNote, contactMade, setContactMade, addNote } = state;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) addNote(); }}
          placeholder="Neue Notiz… (Strg+Enter)"
          rows={2}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none"
        />
        <button
          onClick={addNote}
          disabled={addingNote || !noteText.trim()}
          className="self-end bg-tc-dark hover:bg-tc-dark/90 text-white p-2.5 rounded-lg transition disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={contactMade}
          onChange={(e) => setContactMade(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-tc-blue focus:ring-tc-blue"
        />
        <span className="text-xs text-gray-600">Kontakt hergestellt</span>
        <span className="text-[11px] text-gray-400">(setzt letzten Kontakt & resettet Zähler)</span>
      </label>
    </div>
  );
}
