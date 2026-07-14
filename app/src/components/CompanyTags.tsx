'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { tagColorClasses, type TagData } from '@/lib/tags';

type Props = {
  companyId: string;
  tags: TagData[];
  onChanged: () => void;
};

export default function CompanyTags({ companyId, tags, onChanged }: Props) {
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    if (!showInput) return;
    fetch('/api/tags').then(r => r.json()).then(d => { if (Array.isArray(d)) setAllTags(d); }).catch(() => {});
  }, [showInput]);

  const query = input.trim().toLowerCase();
  const suggestions = allTags
    .filter(t => !tags.some(x => x.id === t.id))
    .filter(t => !query || t.name.toLowerCase().includes(query))
    .slice(0, 6);
  const exactMatch = allTags.some(t => t.name.toLowerCase() === query);

  async function addTag(name: string) {
    if (!name.trim() || adding) return;
    setAdding(true);
    await fetch(`/api/companies/${companyId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    setInput('');
    setAdding(false);
    onChanged();
  }

  async function removeTag(tagId: string) {
    await fetch(`/api/companies/${companyId}/tags?tagId=${tagId}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {tags.map(tag => (
          <span
            key={tag.id}
            className={`inline-flex items-center gap-1 text-xs font-medium pl-2 pr-1 py-0.5 rounded-full border ${tagColorClasses(tag.color)}`}
          >
            {tag.name}
            <button
              onClick={() => removeTag(tag.id)}
              className="opacity-40 hover:opacity-100 transition"
              title="Tag entfernen"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <button
          onClick={() => { setShowInput(!showInput); setInput(''); }}
          className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-tc-blue border border-dashed border-gray-300 hover:border-tc-blue/50 px-2 py-0.5 rounded-full transition"
        >
          <Plus size={11} /> Tag
        </button>
      </div>
      {showInput && (
        <div className="mt-2 space-y-1.5">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && input.trim()) { addTag(input); }
              if (e.key === 'Escape') { setShowInput(false); setInput(''); }
            }}
            placeholder="Tag suchen oder neu anlegen (Enter)…"
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
          />
          {(suggestions.length > 0 || (query && !exactMatch)) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {suggestions.map(t => (
                <button
                  key={t.id}
                  onClick={() => addTag(t.name)}
                  disabled={adding}
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border hover:opacity-70 transition ${tagColorClasses(t.color)}`}
                >
                  {t.name}
                </button>
              ))}
              {query && !exactMatch && (
                <button
                  onClick={() => addTag(input)}
                  disabled={adding}
                  className="text-xs text-tc-blue border border-dashed border-tc-blue/40 px-2 py-0.5 rounded-full hover:bg-tc-blue/5 transition"
                >
                  „{input.trim()}“ neu anlegen
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
