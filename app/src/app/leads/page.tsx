'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, Plus, Download, Upload, AlertCircle, Briefcase, FileText, Mail, CheckSquare, Square, Archive, UserPlus, ArrowRight, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import LeadModal, { LeadFull } from '@/components/LeadModal';
import Header from '@/components/Header';
import ImportModal from '@/components/ImportModal';
import ScoreBreakdownPopover from '@/components/ScoreBreakdown';
import CompanyPicker from '@/components/CompanyPicker';
import { TEMP_LABELS, TEMP_COLORS, Temperature } from '@/lib/temperature';
import { PHASE_LABELS, PHASE_COLORS, VERTRIEB_PHASE_OPTIONS, RECRUITING_PHASE_OPTIONS, LeadPhase } from '@/lib/phase';
import { useCategory } from '@/lib/category-context';

const TEMP_OPTIONS: (Temperature | '')[] = ['', 'hot', 'warm', 'cold'];

type LeadRow = Omit<LeadFull, 'notes'> & { hasOverdueTasks: boolean };
type UserOption = { id: string; name: string; email: string };

type Duplicate = { id: string; firstName: string; lastName: string; matchedBy: string };
const emptyForm = { firstName: '', lastName: '', companyId: '', companyName: '', email: '', phone: '', assignedToId: '', cvFile: null as File | null };

function BulkActionBar({ selectedCount, selectedIds, users, isAdmin, isRecruiting, onDone }: {
  selectedCount: number;
  selectedIds: Set<string>;
  users: UserOption[];
  isAdmin: boolean;
  isRecruiting: boolean;
  onDone: () => void;
}) {
  const [executing, setExecuting] = useState(false);

  async function execute(action: string, value?: string) {
    setExecuting(true);
    try {
      const res = await fetch('/api/leads/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), action, value }),
      });
      if (res.ok) onDone();
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="bg-tc-blue/5 border border-tc-blue/20 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-tc-blue">
        {selectedCount} ausgewählt
      </span>
      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <select
            disabled={executing}
            onChange={(e) => { if (e.target.value) execute('assign', e.target.value); e.target.value = ''; }}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-tc-blue"
          >
            <option value="">Zuweisen…</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
        <button
          disabled={executing}
          onClick={() => execute('archive')}
          className="flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          <Archive size={14} /> Archivieren
        </button>
      </div>
      {executing && <span className="text-xs text-gray-400 animate-pulse">Wird ausgeführt…</span>}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const { category } = useCategory();

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<LeadPhase | ''>('');
  const [tempFilter, setTempFilter] = useState<Temperature | ''>('');
  const [groupFilter, setGroupFilter] = useState(''); // companyId or templateId
  const [sortBy, setSortBy] = useState('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [nameOrder, setNameOrder] = useState<'firstLast' | 'lastFirst'>('lastFirst');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState(false);
  const [groupOptions, setGroupOptions] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<LeadFull | null>(null);
  const [loadingLead, setLoadingLead] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/login');
  }, [authStatus, router]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    fetch('/api/profile').then(r => r.json()).then(data => {
      if (data.nameOrder) setNameOrder(data.nameOrder);
    }).catch(() => {});
    if (isAdmin) {
      fetch('/api/users').then((r) => r.json()).then(setUsers);
    }
  }, [isAdmin, authStatus]);

  // Fetch group filter options (companies or stellen)
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    setGroupFilter('');
    const isRecruiting = category === 'RECRUITING';
    const url = isRecruiting ? '/api/templates?category=RECRUITING' : '/api/companies';
    fetch(url).then(r => r.json()).then((data: any[]) => {
      setGroupOptions(data.map(d => ({ id: d.id, name: d.name })));
    });
  }, [category, authStatus]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (phaseFilter) params.set('phase', phaseFilter);
    if (tempFilter) params.set('temperature', tempFilter);
    params.set('category', category);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    params.set('nameOrder', nameOrder);
    if (phaseFilter === 'ARCHIVIERT') params.set('archived', 'true');
    if (groupFilter) {
      if (category === 'RECRUITING') params.set('templateId', groupFilter);
      else params.set('companyId', groupFilter);
    }
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads);
    setTotalCount(data.totalCount);
    setLoading(false);
  }, [search, phaseFilter, tempFilter, category, groupFilter, page, pageSize, sortBy, sortDir, nameOrder]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const t = setTimeout(fetchLeads, 300);
    return () => clearTimeout(t);
  }, [fetchLeads, authStatus]);

  async function openLead(leadRow: LeadRow) {
    setLoadingLead(leadRow.id);
    const res = await fetch(`/api/leads/${leadRow.id}`);
    const full: LeadFull = await res.json();
    setSelected(full);
    setLoadingLead(null);
  }

  // Open lead or create form from query parameters (e.g. from global search or header +)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('open');
    const create = params.get('create');
    if (authStatus !== 'authenticated') return;
    if (openId) {
      fetch(`/api/leads/${openId}`).then(r => r.json()).then((full: LeadFull) => {
        setSelected(full);
        window.history.replaceState(null, '', '/leads');
      }).catch(() => {});
    }
    if (create === 'true') {
      setShowCreate(true);
      window.history.replaceState(null, '', '/leads');
    }
  }, [authStatus]);

  // Duplicate check when email or phone changes
  useEffect(() => {
    if (!showCreate) { setDuplicates([]); return; }
    if (!form.email && !form.phone) { setDuplicates([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch('/api/leads/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email || null, phone: form.phone || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setDuplicates(data.duplicates ?? []);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [showCreate, form.email, form.phone]);

  const [extracting, setExtracting] = useState(false);
  const [cvDebug, setCvDebug] = useState<string[] | null>(null);

  // Email contact picker
  type EmailContact = { name: string; email: string; date: string };
  const [emailContacts, setEmailContacts] = useState<EmailContact[]>([]);
  const [emailSearch, setEmailSearch] = useState('');
  const [emailPickerOpen, setEmailPickerOpen] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    if (!showCreate || !emailPickerOpen) return;
    const t = setTimeout(async () => {
      setLoadingContacts(true);
      const params = new URLSearchParams();
      if (emailSearch) params.set('search', emailSearch);
      const res = await fetch(`/api/emails/contacts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmailContacts(data.contacts ?? []);
      }
      setLoadingContacts(false);
    }, emailSearch ? 400 : 0);
    return () => clearTimeout(t);
  }, [showCreate, emailPickerOpen, emailSearch]);

  function selectEmailContact(contact: EmailContact) {
    setForm(prev => ({
      ...prev,
      firstName: prev.firstName || contact.name.split(' ').slice(0, -1).join(' ') || contact.name,
      lastName: prev.lastName || (contact.name.includes(' ') ? contact.name.split(' ').pop()! : ''),
      email: contact.email,
    }));
    setEmailPickerOpen(false);
    setEmailSearch('');
  }

  async function handleCvUpload(file: File) {
    setForm(prev => ({ ...prev, cvFile: file }));
    setExtracting(true);
    setCvDebug(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/extract-cv', { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        setCvDebug(data._debug ?? null);
        setForm(prev => ({
          ...prev,
          firstName: data.name ? (data.name.split(' ').slice(0, -1).join(' ') || data.name) : prev.firstName,
          lastName: data.name && data.name.includes(' ') ? data.name.split(' ').pop()! : prev.lastName,
          email: data.email || prev.email,
          phone: data.phone || prev.phone,
        }));
      }
    } catch { /* ignore extraction errors */ }
    setExtracting(false);
  }

  async function createLead() {
    if (!form.firstName && !form.lastName) return;
    setCreating(true);
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        companyId: form.companyId || null,
        email: form.email || null,
        phone: form.phone || null,
        assignedToId: isAdmin ? (form.assignedToId || null) : undefined,
        category,
      }),
    });
    const lead = await res.json();

    // Upload CV as attachment if provided
    if (form.cvFile) {
      const fd = new FormData();
      fd.append('file', form.cvFile);
      fd.append('leadId', lead.id);
      await fetch('/api/attachments', { method: 'POST', body: fd });
    }

    setLeads(prev => [{ ...lead, notes: undefined } as LeadRow, ...prev]);
    setForm(emptyForm);
    setShowCreate(false);
    setCreating(false);
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (phaseFilter) params.set('phase', phaseFilter);
    params.set('category', category);
    window.open(`/api/leads/export?${params}`, '_blank');
  }

  function formatDate(d: string | null) {
    if (!d) return '–';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  if (authStatus === 'loading') return null;

  const isRecruiting = category === 'RECRUITING';

  return (
    <div className="min-h-screen bg-gray-50 max-w-[100vw] overflow-x-hidden">
      <Header />

      <main className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center justify-between">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 flex-1 min-w-0">
            <div className="relative col-span-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Suche…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue w-full sm:w-52"
              />
            </div>
            <select
              value={phaseFilter}
              onChange={(e) => { setPhaseFilter(e.target.value as LeadPhase | ''); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue min-w-0"
            >
              <option value="">Alle Phasen</option>
              {(isRecruiting ? RECRUITING_PHASE_OPTIONS : VERTRIEB_PHASE_OPTIONS).map((p) => (
                <option key={p} value={p}>{PHASE_LABELS[p]}</option>
              ))}
            </select>
            <select
              value={tempFilter}
              onChange={(e) => { setTempFilter(e.target.value as Temperature | ''); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue min-w-0"
            >
              {TEMP_OPTIONS.map((t) => (
                <option key={t} value={t}>{t ? TEMP_LABELS[t] : 'Alle Temp.'}</option>
              ))}
            </select>
            {groupOptions.length > 0 && (
              <select
                value={groupFilter}
                onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue col-span-2 sm:col-span-1 min-w-0"
              >
                <option value="">{category === 'RECRUITING' ? 'Alle Stellen' : 'Alle Firmen'}</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setBulkAction(!bulkAction); setSelectedIds(new Set()); }}
              className={`flex items-center gap-1.5 border text-sm font-medium px-3 py-2 rounded-lg transition ${bulkAction ? 'border-tc-blue bg-tc-blue/10 text-tc-blue' : 'border-gray-200 hover:bg-gray-50 text-gray-700'}`}
            >
              <CheckSquare size={15} /> <span className="hidden sm:inline">Auswahl</span>
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition"
            >
              <Upload size={15} /> <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition"
            >
              <Download size={15} /> <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg transition ml-auto"
            >
              <Plus size={16} /> <span className="hidden sm:inline">{isRecruiting ? 'Neuer Kandidat' : 'Neuer Lead'}</span><span className="sm:hidden">Neu</span>
            </button>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {bulkAction && selectedIds.size > 0 && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            selectedIds={selectedIds}
            users={users}
            isAdmin={isAdmin}
            isRecruiting={isRecruiting}
            onDone={() => { setSelectedIds(new Set()); fetchLeads(); }}
          />
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {bulkAction && (
                    <th className="px-3 py-3 w-8">
                      <button
                        onClick={() => {
                          if (selectedIds.size === leads.length) setSelectedIds(new Set());
                          else setSelectedIds(new Set(leads.map(l => l.id)));
                        }}
                        className="text-gray-400 hover:text-tc-blue transition"
                      >
                        {selectedIds.size === leads.length && leads.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </th>
                  )}
                  {[
                    { key: 'score', label: 'Score', cls: 'w-20' },
                    { key: 'name', label: 'Name', cls: '' },
                    ...(!isRecruiting ? [{ key: 'company', label: 'Firma', cls: 'hidden sm:table-cell' }] : []),
                    { key: 'phase', label: 'Phase', cls: '' },
                    { key: '', label: 'Anfragen', cls: 'hidden md:table-cell' },
                    { key: 'lastContactedAt', label: 'Letzter Kontakt', cls: 'hidden md:table-cell' },
                    ...(isAdmin ? [{ key: '', label: 'Zugewiesen', cls: 'hidden lg:table-cell' }] : []),
                  ].map(col => (
                    <th
                      key={col.label}
                      className={`px-3 sm:px-5 py-3 ${col.cls} ${col.key ? 'cursor-pointer select-none hover:text-tc-dark transition' : ''}`}
                      onClick={col.key ? () => {
                        if (sortBy === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortBy(col.key); setSortDir(col.key === 'score' ? 'desc' : 'asc'); }
                        setPage(1);
                      } : undefined}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {col.key && (sortBy === col.key
                          ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                          : <ArrowUpDown size={10} className="opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={(isAdmin ? 7 : 6) - (isRecruiting ? 1 : 0) + (bulkAction ? 1 : 0)} className="text-center py-12 text-gray-400">Laden…</td></tr>
                )}
                {!loading && leads.length === 0 && (
                  <tr><td colSpan={(isAdmin ? 7 : 6) - (isRecruiting ? 1 : 0) + (bulkAction ? 1 : 0)} className="text-center py-12 text-gray-400">Keine Leads gefunden</td></tr>
                )}
                {leads.map((lead) => {
                  const activeOppCount = lead.opportunities?.filter(o => o.stage !== 'WON' && o.stage !== 'LOST').length ?? 0;
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => {
                        if (bulkAction) {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(lead.id)) next.delete(lead.id);
                            else next.add(lead.id);
                            return next;
                          });
                        } else if (!loadingLead) {
                          openLead(lead);
                        }
                      }}
                      className={`border-b border-gray-100 hover:bg-tc-blue/10 cursor-pointer transition ${loadingLead === lead.id ? 'opacity-60' : ''} ${selectedIds.has(lead.id) ? 'bg-tc-blue/5' : ''}`}
                    >
                      {bulkAction && (
                        <td className="px-3 py-3.5 w-8">
                          {selectedIds.has(lead.id) ? <CheckSquare size={16} className="text-tc-blue" /> : <Square size={16} className="text-gray-300" />}
                        </td>
                      )}
                      <td className="px-3 sm:px-5 py-3.5">
                        {lead.scoreBreakdown ? (
                          <ScoreBreakdownPopover
                            score={lead.score}
                            breakdown={lead.scoreBreakdown}
                            colorClass={TEMP_COLORS[lead.temperature]}
                          >
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${TEMP_COLORS[lead.temperature]} hover:ring-2 hover:ring-tc-blue/50 transition`}>
                              {lead.score}
                            </span>
                          </ScoreBreakdownPopover>
                        ) : (
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${TEMP_COLORS[lead.temperature]}`}>
                            {lead.score}
                          </span>
                        )}
                      </td>
                      <td className="px-3 sm:px-5 py-3.5 font-medium text-gray-900">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{nameOrder === 'firstLast' ? `${lead.firstName} ${lead.lastName}`.trim() : `${lead.lastName} ${lead.firstName}`.trim()}</span>
                          {lead.hasOverdueTasks && (
                            <AlertCircle size={13} className="text-red-500 shrink-0" aria-label="Überfällige Aufgaben" />
                          )}
                        </div>
                      </td>
                      {!isRecruiting && <td className="px-3 sm:px-5 py-3.5 text-gray-500 hidden sm:table-cell">{lead.companyRef?.name ?? '–'}</td>}
                      <td className="px-3 sm:px-5 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PHASE_COLORS[lead.phase] ?? ''}`}>
                          {PHASE_LABELS[lead.phase] ?? lead.phase}
                        </span>
                      </td>
                      <td className="px-3 sm:px-5 py-3.5 hidden md:table-cell">
                        {activeOppCount > 0 ? (
                          <span className="flex items-center gap-1 text-xs text-teal-700">
                            <Briefcase size={12} /> {activeOppCount} aktiv
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">–</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-5 py-3.5 text-gray-500 hidden md:table-cell">{formatDate(lead.lastContactedAt)}</td>
                      {isAdmin && (
                        <td className="px-3 sm:px-5 py-3.5 text-gray-500 hidden lg:table-cell">{lead.assignedTo?.name ?? '–'}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && (
            <div className="px-3 sm:px-5 py-2 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {totalCount > pageSize
                  ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} von ${totalCount}`
                  : `${totalCount} ${isRecruiting ? 'Kandidat' : 'Lead'}${totalCount !== 1 ? 'en' : ''}`
                }
              </span>
              {totalCount > pageSize && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition"
                  >
                    <ChevronLeft size={14} className="text-gray-500" />
                  </button>
                  <span className="text-xs text-gray-500 px-1">
                    {page} / {Math.ceil(totalCount / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                    disabled={page >= Math.ceil(totalCount / pageSize)}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition"
                  >
                    <ChevronRight size={14} className="text-gray-500" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setForm(emptyForm); setCvDebug(null); setDuplicates([]); setEmailPickerOpen(false); setEmailSearch(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">{isRecruiting ? 'Neuer Kandidat' : 'Neuer Lead'}</h2>

            {/* Email Contact Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmailPickerOpen(!emailPickerOpen)}
                className="w-full flex items-center justify-between border border-gray-200 hover:border-tc-blue/50 rounded-lg px-3 py-2.5 text-sm text-gray-500 transition"
              >
                <span className="flex items-center gap-2">
                  <Mail size={15} className="text-tc-blue shrink-0" />
                  <span>{form.email ? `${`${form.firstName} ${form.lastName}`.trim() || 'Kontakt'} (${form.email})` : 'Aus E-Mail-Kontakt erstellen…'}</span>
                </span>
                {emailPickerOpen && <span className="text-gray-400 hover:text-red-500 text-xs">✕</span>}
              </button>
              {emailPickerOpen && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  <input
                    value={emailSearch}
                    onChange={e => setEmailSearch(e.target.value)}
                    placeholder="Kontakt suchen…"
                    autoFocus
                    className="w-full px-3 py-2 text-sm border-b border-gray-100 focus:outline-none"
                  />
                  <div className="max-h-48 overflow-y-auto">
                    {loadingContacts && <p className="text-xs text-gray-400 text-center py-3">Lade…</p>}
                    {!loadingContacts && emailContacts.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-3">Keine neuen Kontakte gefunden</p>
                    )}
                    {emailContacts.map(c => (
                      <button
                        key={c.email}
                        onClick={() => selectEmailContact(c)}
                        className="w-full text-left px-3 py-2 hover:bg-tc-blue/10 transition flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 truncate">{c.name}</p>
                          <p className="text-xs text-gray-400 truncate">{c.email}</p>
                        </div>
                        <span className="text-[11px] text-gray-300 shrink-0">
                          {new Date(c.date).toLocaleDateString('de-DE')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CV Upload */}
            <div className="relative border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-tc-blue/50 transition group">
              {form.cvFile ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  {form.cvFile.name.endsWith('.eml') ? <Mail size={16} className="text-tc-blue" /> : <FileText size={16} className="text-red-400" />}
                  <span className="text-gray-700 truncate max-w-[200px]">{form.cvFile.name}</span>
                  {extracting && <span className="text-tc-blue text-xs animate-pulse">Lese aus…</span>}
                  <button onClick={() => setForm({ ...form, cvFile: null })} className="text-gray-400 hover:text-red-500 text-xs ml-1">✕</button>
                </div>
              ) : (
                <div>
                  <FileText size={20} className="mx-auto text-gray-300 mb-1" />
                  <p className="text-xs text-gray-400">PDF oder E-Mail hochladen (optional)</p>
                  <p className="text-[11px] text-gray-300">Felder werden automatisch ausgefüllt</p>
                </div>
              )}
              {!form.cvFile && (
                <input
                  type="file"
                  accept="application/pdf,.eml,message/rfc822"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCvUpload(f); e.target.value = ''; }}
                />
              )}
            </div>

            {cvDebug && (
              <details className="text-[11px] text-gray-400 bg-gray-50 rounded-lg p-2">
                <summary className="cursor-pointer font-medium">Debug: PDF-Zeilen ({cvDebug.length})</summary>
                <ol className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                  {cvDebug.map((line, i) => (
                    <li key={i} className="font-mono truncate">{i + 1}. {line}</li>
                  ))}
                </ol>
              </details>
            )}

            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Vorname *"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') createLead(); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
              />
              <input
                placeholder="Nachname"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') createLead(); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
              />
              {!isRecruiting && (
                <CompanyPicker
                  value={form.companyId}
                  displayName={form.companyName}
                  onChange={(id, name) => setForm({ ...form, companyId: id, companyName: name })}
                />
              )}
              <input
                placeholder="Telefon"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
              />
              <input
                placeholder="E-Mail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="col-span-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
              />
              {isAdmin && (
                <select
                  value={form.assignedToId}
                  onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
                  className="col-span-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                >
                  <option value="">Nicht zugewiesen</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              )}
            </div>
            {/* Duplicate Warning */}
            {duplicates.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="text-sm text-amber-800 font-medium flex items-center gap-1.5">
                  <AlertCircle size={15} className="shrink-0" />
                  Mögliches Duplikat gefunden
                </p>
                {duplicates.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-amber-700">
                      <strong>{`${d.firstName} ${d.lastName}`.trim()}</strong> — gleiche {d.matchedBy === 'email' ? 'E-Mail' : 'Telefonnummer'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreate(false);
                        setForm(emptyForm);
                        setCvDebug(null);
                        setDuplicates([]);
                        // Open the existing lead
                        openLead({ id: d.id } as LeadRow);
                      }}
                      className="text-xs font-medium text-tc-blue hover:text-tc-dark whitespace-nowrap underline transition"
                    >
                      Kontakt öffnen
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreate(false); setForm(emptyForm); setCvDebug(null); setDuplicates([]); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Abbrechen
              </button>
              <button
                onClick={createLead}
                disabled={creating || (!form.firstName && !form.lastName)}
                className="bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {creating ? 'Erstellen…' : (duplicates.length > 0 ? 'Trotzdem erstellen' : 'Erstellen')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={fetchLeads}
        />
      )}

      {/* Lead Detail Modal */}
      {selected && (
        <LeadModal
          lead={selected}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onUpdate={(updated) => {
            setLeads(prev => prev.map((l) => l.id === updated.id
              ? { ...updated, hasOverdueTasks: l.hasOverdueTasks }
              : l
            ));
            setSelected(updated);
          }}
          onDelete={(id) => {
            setLeads(prev => prev.filter((l) => l.id !== id));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
