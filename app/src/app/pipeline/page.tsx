'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, DragOverlay, closestCorners,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Header from '@/components/Header';
import OpportunityModal from '@/components/OpportunityModal';
import type { OpportunityFull } from '@/components/OpportunityModal';
import LeadModal, { LeadFull } from '@/components/LeadModal';
import CompanyDetailModal from '@/components/CompanyDetailModal';
import TemplateDetailModal from '@/components/TemplateDetailModal';
import { OPP_STAGE_LABELS, OPP_STAGE_ORDER, OPP_STAGE_COLORS, OpportunityStage, getStageOrder } from '@/lib/opportunity';
import { TEMP_LABELS, TEMP_COLORS, Temperature } from '@/lib/temperature';
import { GripVertical, Plus, X, FileText, Mail } from 'lucide-react';
import CompanyPicker from '@/components/CompanyPicker';
import { useCategory } from '@/lib/category-context';

interface OppCard {
  id: string;
  title: string;
  stage: OpportunityStage;
  temperature: Temperature;
  value: number | null;
  lead: { id: string; firstName: string; lastName: string; companyRef?: { id: string; name: string } | null };
  assignedTo?: { id: string; name: string } | null;
}

function CardContent({ opp, overlay = false, onOpenLead }: { opp: OppCard; overlay?: boolean; onOpenLead?: (leadId: string) => void }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-3 shadow-sm select-none overflow-hidden
      ${overlay ? 'shadow-lg rotate-1 opacity-90' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-gray-900 truncate">{opp.title}</p>
          <p className="text-xs text-gray-500 truncate">
            <button
              onClick={(e) => { if (onOpenLead) { e.stopPropagation(); onOpenLead(opp.lead.id); } }}
              className={onOpenLead ? 'text-tc-blue hover:underline' : ''}
            >
              {`${opp.lead.firstName} ${opp.lead.lastName}`.trim()}
            </button>
            {opp.lead.companyRef?.name ? ` · ${opp.lead.companyRef.name}` : ''}
          </p>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${TEMP_COLORS[opp.temperature]}`}>
          {TEMP_LABELS[opp.temperature]}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2">
        {opp.value != null
          ? <span className="text-xs text-gray-500">{opp.value.toLocaleString('de-DE')} €</span>
          : <span />
        }
        {opp.assignedTo && (
          <span className="text-xs text-gray-400">{opp.assignedTo.name}</span>
        )}
      </div>
    </div>
  );
}

function SortableCard({ opp, onOpen, onOpenLead }: { opp: OppCard; onOpen: (id: string) => void; onOpenLead?: (leadId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opp.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="min-w-0">
      <div className="flex items-stretch gap-1 min-w-0">
        <div {...listeners} className="flex items-center cursor-grab text-gray-300 hover:text-gray-500 px-0.5 shrink-0">
          <GripVertical size={14} />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(opp.id)}>
          <CardContent opp={opp} onOpenLead={onOpenLead} />
        </div>
      </div>
    </div>
  );
}

function Column({ stage, opps, onOpen, onOpenLead }: { stage: OpportunityStage; opps: OppCard[]; onOpen: (id: string) => void; onOpenLead?: (leadId: string) => void }) {
  const colorClass = OPP_STAGE_COLORS[stage];
  const totalValue = opps.reduce((sum, o) => sum + (o.value ?? 0), 0);

  return (
    <div className="flex flex-col flex-1 min-w-[180px] max-w-[280px]">
      <div className={`rounded-t-lg border px-3 py-2 font-medium text-sm ${colorClass}`}>
        <div className="flex items-center justify-between">
          <span>{OPP_STAGE_LABELS[stage]}</span>
          <span className="text-xs opacity-70">({opps.length})</span>
        </div>
        {totalValue > 0 && (
          <p className="text-xs opacity-60 mt-0.5">{totalValue.toLocaleString('de-DE')} €</p>
        )}
      </div>
      <div className={`flex-1 rounded-b-lg border border-t-0 bg-white/60 p-2 min-h-[120px] space-y-2 overflow-hidden ${colorClass.split(' ').find(c => c.startsWith('border')) ?? ''}`}>
        <SortableContext items={opps.map(o => o.id)} strategy={verticalListSortingStrategy}>
          {opps.map(opp => <SortableCard key={opp.id} opp={opp} onOpen={onOpen} onOpenLead={onOpenLead} />)}
        </SortableContext>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'ADMIN';
  const { category } = useCategory();
  const [opps, setOpps] = useState<OppCard[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openOppId, setOpenOppId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadFull | null>(null);
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; defaultValue: number | null }[]>([]);
  // Lead selection or creation
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [selectedLeadForCreate, setSelectedLeadForCreate] = useState<{ id: string; name: string } | null>(null);
  const [newLeadMode, setNewLeadMode] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ firstName: '', lastName: '', email: '', phone: '', companyId: '', companyName: '' });
  // Opp fields
  const [oppTitle, setOppTitle] = useState('');
  const [oppValue, setOppValue] = useState('');
  const [oppTemplateId, setOppTemplateId] = useState('');
  // File upload
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [creatingOpp, setCreatingOpp] = useState(false);

  // Load templates when create opens
  useEffect(() => {
    if (!showCreate) return;
    fetch(`/api/templates?category=${category}`).then(r => r.json()).then(data => {
      setTemplates(data.map((t: any) => ({ id: t.id, name: t.name, defaultValue: t.defaultValue })));
    }).catch(() => {});
  }, [showCreate, category]);

  // Debounced lead search
  useEffect(() => {
    if (!leadSearch || leadSearch.length < 2) { setLeadResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(leadSearch)}&category=${category}`);
      if (res.ok) {
        const data = await res.json();
        setLeadResults(data.map((l: any) => ({ id: l.id, firstName: l.firstName, lastName: l.lastName })));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [leadSearch, category]);

  function handleTemplateSelect(templateId: string) {
    setOppTemplateId(templateId);
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      if (!oppTitle) setOppTitle(tpl.name);
      if (!oppValue && tpl.defaultValue) setOppValue(String(tpl.defaultValue));
    }
  }

  async function handleFileUpload(file: File) {
    setCvFile(file);
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/extract-cv', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.firstName) setNewLeadForm(prev => ({ ...prev, firstName: prev.firstName || data.firstName }));
        if (data.lastName) setNewLeadForm(prev => ({ ...prev, lastName: prev.lastName || data.lastName }));
        if (data.email) setNewLeadForm(prev => ({ ...prev, email: prev.email || data.email }));
        if (data.phone) setNewLeadForm(prev => ({ ...prev, phone: prev.phone || data.phone }));
      }
    } finally {
      setExtracting(false);
    }
  }

  function resetCreateForm() {
    setShowCreate(false);
    setLeadSearch(''); setLeadResults([]); setSelectedLeadForCreate(null);
    setNewLeadMode(false); setNewLeadForm({ firstName: '', lastName: '', email: '', phone: '', companyId: '', companyName: '' });
    setOppTitle(''); setOppValue(''); setOppTemplateId('');
    setCvFile(null);
  }

  async function submitCreateOpp() {
    setCreatingOpp(true);
    try {
      let leadId = selectedLeadForCreate?.id;
      // Create new lead if needed
      if (newLeadMode && !leadId) {
        if (!newLeadForm.firstName.trim()) return;
        const leadRes = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: newLeadForm.firstName.trim(),
            lastName: newLeadForm.lastName.trim(),
            email: newLeadForm.email.trim() || null,
            phone: newLeadForm.phone.trim() || null,
            companyId: newLeadForm.companyId || null,
            category,
          }),
        });
        if (!leadRes.ok) return;
        const lead = await leadRes.json();
        leadId = lead.id;
        // Upload file as attachment
        if (cvFile && leadId) {
          const fd = new FormData();
          fd.append('file', cvFile);
          fd.append('leadId', leadId);
          await fetch('/api/attachments', { method: 'POST', body: fd });
        }
      }
      if (!leadId || !oppTitle.trim()) return;
      const stage = category === 'RECRUITING' ? 'SCREENING' : 'PROPOSAL';
      await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: oppTitle.trim(),
          leadId,
          value: oppValue ? parseFloat(oppValue) : null,
          templateId: oppTemplateId || null,
          stage,
        }),
      });
      resetCreateForm();
      load();
    } finally {
      setCreatingOpp(false);
    }
  }

  async function openLead(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}`);
    if (res.ok) setSelectedLead(await res.json());
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('category', category);
    const res = await fetch(`/api/opportunities?${params}`);
    if (res.ok) setOpps(await res.json());
  }, [category]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated') {
      load();
      if (isAdmin) fetch('/api/users').then(r => r.json()).then(setUsers);
    }
  }, [status, router, load, isAdmin]);

  // Open from query parameters (e.g. from global search)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('open');
    const openLeadId = params.get('openLead');
    if (status !== 'authenticated') return;
    const create = params.get('create');
    if (openId) { setOpenOppId(openId); window.history.replaceState(null, '', '/pipeline'); }
    if (openLeadId) { openLead(openLeadId); window.history.replaceState(null, '', '/pipeline'); }
    if (create === 'true') { setShowCreate(true); window.history.replaceState(null, '', '/pipeline'); }
  }, [status]);

  const byStage = (stage: OpportunityStage) => opps.filter(o => o.stage === stage);
  const activeOpp = opps.find(o => o.id === activeId);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeStage = opps.find(o => o.id === active.id)?.stage;
    const stages = getStageOrder(category);
    const overStage = stages.includes(over.id as OpportunityStage)
      ? (over.id as OpportunityStage)
      : opps.find(o => o.id === over.id)?.stage;
    if (!activeStage || !overStage || activeStage === overStage) return;
    setOpps(prev => prev.map(o => o.id === active.id ? { ...o, stage: overStage } : o));
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const opp = opps.find(o => o.id === active.id);
    if (!opp) return;

    // For stages with email intercepts (REJECTED, INTERVIEW), open the modal instead of saving directly
    const interceptStages: OpportunityStage[] = ['REJECTED', 'INTERVIEW'];
    if (interceptStages.includes(opp.stage) && category === 'RECRUITING') {
      setOpenOppId(opp.id);
      return;
    }

    const res = await fetch(`/api/opportunities/${opp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: opp.stage }),
    });
    if (!res.ok) {
      load();
    }
  }

  function handleOppUpdate(updated: OpportunityFull) {
    setOpps(prev => prev.map(o => o.id === updated.id
      ? { ...o, title: updated.title, stage: updated.stage, value: updated.value, temperature: updated.temperature }
      : o
    ));
  }

  function handleOppDelete(id: string) {
    setOpps(prev => prev.filter(o => o.id !== id));
    setOpenOppId(null);
  }

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <Plus size={15} /> {category === 'RECRUITING' ? 'Bewerbung anlegen' : 'Anfrage anlegen'}
          </button>
        </div>

        {/* Create Opportunity Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && resetCreateForm()}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{category === 'RECRUITING' ? 'Neue Bewerbung' : 'Neue Anfrage'}</h2>
                <button onClick={resetCreateForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>

              {/* Step 1: Select or create contact */}
              <div>
                <label className="text-xs text-gray-500 font-medium">Kontakt *</label>
                {selectedLeadForCreate ? (
                  <div className="flex items-center gap-2 mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50">
                    <span className="flex-1 font-medium">{selectedLeadForCreate.name}</span>
                    <button onClick={() => { setSelectedLeadForCreate(null); setNewLeadMode(false); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                ) : !newLeadMode ? (
                  <div className="relative mt-1">
                    <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                      placeholder="Kontakt suchen oder neu anlegen…" autoFocus
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                    {(leadResults.length > 0 || leadSearch.length >= 2) && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                        {leadResults.map(l => (
                          <button key={l.id} onClick={() => { setSelectedLeadForCreate({ id: l.id, name: `${l.firstName} ${l.lastName}`.trim() }); setLeadSearch(''); setLeadResults([]); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">{`${l.firstName} ${l.lastName}`.trim()}</button>
                        ))}
                        <button onClick={() => { setNewLeadMode(true); setLeadSearch(''); setLeadResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm text-tc-blue hover:bg-tc-blue/10 font-medium flex items-center gap-1.5">
                          <Plus size={13} /> Neuen Kontakt anlegen
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 space-y-2">
                    {/* File Upload */}
                    <div className="relative border-2 border-dashed border-gray-200 rounded-xl p-3 text-center hover:border-tc-blue/50 transition">
                      {cvFile ? (
                        <div className="flex items-center justify-center gap-2 text-sm">
                          {cvFile.name.endsWith('.eml') ? <Mail size={16} className="text-tc-blue" /> : <FileText size={16} className="text-red-400" />}
                          <span className="text-gray-700 truncate max-w-[200px]">{cvFile.name}</span>
                          {extracting && <span className="text-tc-blue text-xs animate-pulse">Lese aus…</span>}
                          <button onClick={() => setCvFile(null)} className="text-gray-400 hover:text-red-500 text-xs ml-1">✕</button>
                        </div>
                      ) : (
                        <div>
                          <FileText size={18} className="mx-auto text-gray-300 mb-1" />
                          <p className="text-xs text-gray-400">{category === 'RECRUITING' ? 'Anschreiben/CV' : 'Dokument'} hochladen (optional)</p>
                        </div>
                      )}
                      {!cvFile && (
                        <input type="file" accept="application/pdf,.eml,message/rfc822"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Vorname *" value={newLeadForm.firstName}
                        onChange={e => setNewLeadForm({ ...newLeadForm, firstName: e.target.value })}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                      <input placeholder="Nachname" value={newLeadForm.lastName}
                        onChange={e => setNewLeadForm({ ...newLeadForm, lastName: e.target.value })}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                      <input placeholder="E-Mail" value={newLeadForm.email}
                        onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                      <input placeholder="Telefon" value={newLeadForm.phone}
                        onChange={e => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                    </div>
                    {category === 'VERTRIEB' && (
                      <CompanyPicker value={newLeadForm.companyId} displayName={newLeadForm.companyName}
                        onChange={(id, name) => setNewLeadForm({ ...newLeadForm, companyId: id, companyName: name })} />
                    )}
                    <button onClick={() => setNewLeadMode(false)} className="text-xs text-gray-400 hover:text-gray-600">Abbrechen</button>
                  </div>
                )}
              </div>

              {/* Template/Stelle Picker */}
              {templates.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">{category === 'RECRUITING' ? 'Stelle' : 'Produkt'}</label>
                  <select value={oppTemplateId} onChange={e => handleTemplateSelect(e.target.value)}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue">
                    <option value="">— Auswählen (optional) —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {/* Opp Title & Value */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium">Titel *</label>
                  <input value={oppTitle} onChange={e => setOppTitle(e.target.value)}
                    placeholder={category === 'RECRUITING' ? 'Bewerbungstitel' : 'Anfragetitel'}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium">Wert (€)</label>
                  <input type="number" value={oppValue} onChange={e => setOppValue(e.target.value)} placeholder="optional"
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={resetCreateForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Abbrechen</button>
                <button onClick={submitCreateOpp}
                  disabled={creatingOpp || !oppTitle.trim() || (!selectedLeadForCreate && (!newLeadMode || !newLeadForm.firstName.trim()))}
                  className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
                  {creatingOpp ? 'Erstelle…' : 'Anlegen'}
                </button>
              </div>
            </div>
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {getStageOrder(category).map(stage => (
              <Column key={stage} stage={stage} opps={byStage(stage)} onOpen={setOpenOppId} onOpenLead={openLead} />
            ))}
          </div>
          <DragOverlay>
            {activeOpp && <CardContent opp={activeOpp} overlay />}
          </DragOverlay>
        </DndContext>
      </main>

      {openOppId && (
        <OpportunityModal
          opportunityId={openOppId}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setOpenOppId(null)}
          onUpdate={handleOppUpdate}
          onDelete={handleOppDelete}
          onOpenLead={(id) => { setOpenOppId(null); openLead(id); }}
          onOpenCompany={(id) => { setOpenOppId(null); setOpenCompanyId(id); }}
          onOpenTemplate={(id) => { setOpenOppId(null); setOpenTemplateId(id); }}
        />
      )}

      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setSelectedLead(null)}
          onUpdate={(updated) => { setSelectedLead(updated); load(); }}
          onDelete={() => { setSelectedLead(null); load(); }}
          onOpenCompany={(id) => { setSelectedLead(null); setOpenCompanyId(id); }}
          onOpenTemplate={(id) => { setSelectedLead(null); setOpenTemplateId(id); }}
        />
      )}

      {openCompanyId && (
        <CompanyDetailModal
          companyId={openCompanyId}
          onClose={() => setOpenCompanyId(null)}
          onUpdate={load}
          onOpenLead={(id) => { setOpenCompanyId(null); openLead(id); }}
          onOpenOpportunity={(id) => { setOpenCompanyId(null); setOpenOppId(id); }}
        />
      )}

      {openTemplateId && (
        <TemplateDetailModal
          templateId={openTemplateId}
          isAdmin={isAdmin}
          onClose={() => setOpenTemplateId(null)}
          onUpdate={load}
          onOpenLead={(id) => { setOpenTemplateId(null); openLead(id); }}
          onOpenOpportunity={(id) => { setOpenTemplateId(null); setOpenOppId(id); }}
        />
      )}
    </div>
  );
}
