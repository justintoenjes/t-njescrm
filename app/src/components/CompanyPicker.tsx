'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';

type CompanyOption = { id: string; name: string };

type Props = {
  value: string; // companyId
  displayName: string;
  onChange: (companyId: string, companyName: string) => void;
};

export default function CompanyPicker({ value, displayName, onChange }: Props) {
  const [query, setQuery] = useState(displayName);
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(displayName); }, [displayName]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      const res = await fetch(`/api/companies?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.map((c: CompanyOption) => ({ id: c.id, name: c.name })));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  async function createCompany() {
    if (!query.trim()) return;
    setCreating(true);
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: query.trim() }),
    });
    const company = await res.json();
    onChange(company.id, company.name);
    setOpen(false);
    setCreating(false);
  }

  function selectCompany(c: CompanyOption) {
    onChange(c.id, c.name);
    setQuery(c.name);
    setOpen(false);
  }

  function clearCompany() {
    onChange('', '');
    setQuery('');
  }

  const exactMatch = results.some(r => r.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-1">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Firma suchen oder erstellen…"
          className="flex-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
        />
        {value && (
          <button
            type="button"
            onClick={clearCompany}
            className="text-gray-400 hover:text-gray-600 px-2 text-xs"
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              onClick={() => selectCompany(c)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-tc-blue/10 transition ${c.id === value ? 'bg-tc-blue/10 font-medium' : ''}`}
            >
              {c.name}
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              onClick={createCompany}
              disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-tc-blue hover:bg-tc-blue/10 transition flex items-center gap-1.5 border-t border-gray-100"
            >
              <Plus size={13} /> &quot;{query.trim()}&quot; erstellen
            </button>
          )}
          {results.length === 0 && !query.trim() && (
            <p className="px-3 py-2 text-xs text-gray-400">Keine Firmen vorhanden</p>
          )}
        </div>
      )}
    </div>
  );
}
