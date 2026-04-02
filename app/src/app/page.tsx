'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, Plus, Download, Upload, AlertCircle, Briefcase, FileText, Mail } from 'lucide-react';
import LeadModal, { LeadFull } from '@/components/LeadModal';
import Header from '@/components/Header';
import ImportModal from '@/components/ImportModal';
import ScoreBreakdownPopover from '@/components/ScoreBreakdown';
import CompanyPicker from '@/components/CompanyPicker';
import { TEMP_LABELS, TEMP_COLORS, Temperature } from '@/lib/temperature';
import { PHASE_LABELS, PHASE_COLORS, PHASE_OPTIONS, LeadPhase } from '@/lib/phase';
import { useCategory } from '@/lib/category-context';

const TEMP_OPTIONS: (Temperature | '')[] = ['', 'hot', 'warm', 'cold'];

type LeadRow = Omit<LeadFull, 'notes'> & { hasOverdueTasks: boolean };
type UserOption = { id: string; name: string; email: string };

type Duplicate = { id: string; name: string; matchedBy: string };
const emptyForm = { name: '', companyId: '', companyName: '', email: '', phone: '', assignedToId: '', cvFile: null as File | null };

export default function HomePage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const { category } = useCategory();

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<LeadPhase | ''>('');
  const [tempFilter, setTempFilter] = useState<Temperature | ''>('');
  const [groupFilter, setGroupFilter] = useState(''); // companyId or templateId
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
    if (isAdmin) {
      fetch('/api/users').then((r) => r.json()).then(setUsers);
    }
  }, [isAdmin]);

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
    if (phaseFilter === 'ARCHIVIERT') params.set('archived', 'true');
    if (groupFilter) {
      if (category === 'RECRUITING') params.set('templateId', groupFilter);
      else params.set('companyId', groupFilter);
    }
    const res = await fetch(`/api/leads?${params}`);
    setLeads(await res.json());
    setLoading(false);
  }, [search, phaseFilter, tempFilter, category, groupFilter]);

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
      name: prev.name || contact.name,
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
          name: data.name || prev.name,
          email: data.email || prev.email,
          phone: data.phone || prev.phone,
        }));
      }
    } catch { /* ignore extraction errors */ }
    setExtracting(false);
  }

  async function createLead() {
    if (!form.name) return;
    setCreating(true);
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
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
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue w-full sm:w-52"
              />
            </div>
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as LeadPhase | '')}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue min-w-0"
            >
              <option value="">Alle Phasen</option>
              {PHASE_OPTIONS.map((p) => (
                <option key={p} value={p}>{PHASE_LABELS[p]}</option>
              ))}
            </select>
            <select
              value={tempFilter}
              onChange={(e) => setTempFilter(e.target.value as Temperature | '')}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue min-w-0"
            >
              {TEMP_OPTIONS.map((t) => (
                <option key={t} value={t}>{t ? TEMP_LABELS[t] : 'Alle Temp.'}</option>
              ))}
            </select>
            {groupOptions.length > 0 && (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
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

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-0">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-3 sm:px-5 py-3">Score</th>
                  <th className="px-3 sm:px-5 py-3">Name</th>
                  {!isRecruiting && <th className="px-3 sm:px-5 py-3 hidden sm:table-cell">Firma</th>}
                  <th className="px-3 sm:px-5 py-3">Phase</th>
                  <th className="px-3 sm:px-5 py-3 hidden md:table-cell">Opportunities</th>
                  <th className="px-3 sm:px-5 py-3 hidden md:table-cell">Letzter Kontakt</th>
                  {isAdmin && <th className="px-3 sm:px-5 py-3 hidden lg:table-cell">Zugewiesen</th>}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={(isAdmin ? 7 : 6) - (isRecruiting ? 1 : 0)} className="text-center py-12 text-gray-400">Laden…</td></tr>
                )}
                {!loading && leads.length === 0 && (
                  <tr><td colSpan={(isAdmin ? 7 : 6) - (isRecruiting ? 1 : 0)} className="text-center py-12 text-gray-400">Keine Leads gefunden</td></tr>
                )}
                {leads.map((lead) => {
                  const activeOppCount = lead.opportunities?.filter(o => o.stage !== 'WON' && o.stage !== 'LOST').length ?? 0;
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => !loadingLead && openLead(lead)}
                      className={`border-b border-gray-100 hover:bg-tc-blue/10 cursor-pointer transition ${loadingLead === lead.id ? 'opacity-60' : ''}`}
                    >
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
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[120px] sm:max-w-none">{lead.name}</span>
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
            <div className="px-3 sm:px-5 py-2 border-t border-gray-100 text-xs text-gray-400">
              {leads.length} {isRecruiting ? 'Kandidat' : 'Lead'}{leads.length !== 1 ? 'en' : ''}
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
                  <span>{form.email ? `${form.name || 'Kontakt'} (${form.email})` : 'Aus E-Mail-Kontakt erstellen…'}</span>
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
                placeholder="Name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') createLead(); }}
                className="col-span-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
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
                      <strong>{d.name}</strong> — gleiche {d.matchedBy === 'email' ? 'E-Mail' : 'Telefonnummer'}
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
                disabled={creating || !form.name}
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
