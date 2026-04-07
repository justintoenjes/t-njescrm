'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User, Building2, Package, Briefcase } from 'lucide-react';
import { useCategory } from '@/lib/category-context';

type LeadResult = { id: string; firstName: string; lastName: string; email: string | null; companyRef: { id: string; name: string } | null };
type CompanyResult = { id: string; name: string; website: string | null };
type TemplateResult = { id: string; name: string; category: string };
type OppResult = { id: string; title: string; stage: string; lead: { id: string; firstName: string; lastName: string } };

type Results = {
  leads: LeadResult[];
  companies: CompanyResult[];
  templates: TemplateResult[];
  opportunities: OppResult[];
};

type FlatItem =
  | { type: 'lead'; data: LeadResult }
  | { type: 'company'; data: CompanyResult }
  | { type: 'template'; data: TemplateResult }
  | { type: 'opportunity'; data: OppResult };

type Props = {
  onOpenLead?: (id: string) => void;
  onOpenCompany?: (id: string) => void;
  onOpenTemplate?: (id: string) => void;
  onOpenOpportunity?: (id: string) => void;
};

export default function GlobalSearch({ onOpenLead, onOpenCompany, onOpenTemplate, onOpenOpportunity }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { category } = useCategory();

  const isRecruiting = category === 'RECRUITING';

  // Cmd+K handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults(null);
      setActiveIndex(0);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&category=${category}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setActiveIndex(0);
      }
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Flatten results for keyboard navigation
  const flatItems: FlatItem[] = results ? [
    ...results.leads.map(d => ({ type: 'lead' as const, data: d })),
    ...results.companies.map(d => ({ type: 'company' as const, data: d })),
    ...results.templates.map(d => ({ type: 'template' as const, data: d })),
    ...results.opportunities.map(d => ({ type: 'opportunity' as const, data: d })),
  ] : [];

  function selectItem(item: FlatItem) {
    setOpen(false);
    switch (item.type) {
      case 'lead': onOpenLead?.(item.data.id); break;
      case 'company': onOpenCompany?.(item.data.id); break;
      case 'template': onOpenTemplate?.(item.data.id); break;
      case 'opportunity': onOpenOpportunity?.(item.data.id); break;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flatItems.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && flatItems[activeIndex]) { e.preventDefault(); selectItem(flatItems[activeIndex]); }
  }

  const totalResults = flatItems.length;
  const hasResults = results && totalResults > 0;
  const noResults = results && totalResults === 0 && query.length >= 2;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5 transition-colors shrink-0 min-w-[160px]"
        title="Suche (⌘K)"
      >
        <Search size={14} className="text-white/40" />
        <span className="text-xs text-white/30 flex-1">Suchen…</span>
        <kbd className="text-[10px] text-white/25 bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>
    );
  }

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecruiting ? 'Kandidaten, Stellen, Bewerbungen suchen…' : 'Kontakte, Firmen, Anfragen suchen…'}
            className="flex-1 text-sm outline-none placeholder:text-gray-400"
          />
          {loading && <div className="w-4 h-4 border-2 border-tc-blue/30 border-t-tc-blue rounded-full animate-spin shrink-0" />}
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        {hasResults && (
          <div className="max-h-[50vh] overflow-y-auto py-2">
            {results.leads.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {isRecruiting ? 'Kandidaten' : 'Kontakte'}
                </div>
                {results.leads.map(lead => {
                  const idx = flatIdx++;
                  return (
                    <button
                      key={`lead-${lead.id}`}
                      onClick={() => selectItem({ type: 'lead', data: lead })}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors
                        ${activeIndex === idx ? 'bg-tc-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <User size={14} className="text-gray-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-900">{`${lead.firstName} ${lead.lastName}`.trim()}</span>
                        {lead.companyRef && <span className="text-xs text-gray-400 ml-2">{lead.companyRef.name}</span>}
                      </div>
                      {lead.email && <span className="text-xs text-gray-400 truncate max-w-[120px]">{lead.email}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {results.companies.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Firmen</div>
                {results.companies.map(company => {
                  const idx = flatIdx++;
                  return (
                    <button
                      key={`company-${company.id}`}
                      onClick={() => selectItem({ type: 'company', data: company })}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors
                        ${activeIndex === idx ? 'bg-tc-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <Building2 size={14} className="text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{company.name}</span>
                      {company.website && <span className="text-xs text-gray-400 ml-auto truncate max-w-[150px]">{company.website}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {results.templates.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {isRecruiting ? 'Stellen' : 'Produkte'}
                </div>
                {results.templates.map(template => {
                  const idx = flatIdx++;
                  return (
                    <button
                      key={`template-${template.id}`}
                      onClick={() => selectItem({ type: 'template', data: template })}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors
                        ${activeIndex === idx ? 'bg-tc-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <Package size={14} className="text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{template.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {results.opportunities.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {isRecruiting ? 'Bewerbungen' : 'Anfragen'}
                </div>
                {results.opportunities.map(opp => {
                  const idx = flatIdx++;
                  return (
                    <button
                      key={`opp-${opp.id}`}
                      onClick={() => selectItem({ type: 'opportunity', data: opp })}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors
                        ${activeIndex === idx ? 'bg-tc-blue/10' : 'hover:bg-gray-50'}`}
                    >
                      <Briefcase size={14} className="text-gray-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-900">{opp.title}</span>
                        <span className="text-xs text-gray-400 ml-2">{`${opp.lead.firstName} ${opp.lead.lastName}`.trim()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {noResults && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            Keine Ergebnisse für &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span><kbd className="px-1 py-0.5 bg-white border rounded text-[10px]">↑↓</kbd> Navigation</span>
            <span><kbd className="px-1 py-0.5 bg-white border rounded text-[10px]">↵</kbd> Öffnen</span>
            <span><kbd className="px-1 py-0.5 bg-white border rounded text-[10px]">Esc</kbd> Schließen</span>
          </div>
        </div>
      </div>
    </div>
  );
}
