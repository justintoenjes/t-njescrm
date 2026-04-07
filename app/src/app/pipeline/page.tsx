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
import { GripVertical, Plus, X } from 'lucide-react';
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
  const [newOpp, setNewOpp] = useState({ title: '', value: '', leadSearch: '', leadId: '' });
  const [leadResults, setLeadResults] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [creatingOpp, setCreatingOpp] = useState(false);

  useEffect(() => {
    if (!newOpp.leadSearch || newOpp.leadSearch.length < 2) { setLeadResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(newOpp.leadSearch)}&category=${category}`);
      if (res.ok) {
        const data = await res.json();
        setLeadResults(data.map((l: any) => ({ id: l.id, firstName: l.firstName, lastName: l.lastName })));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [newOpp.leadSearch, category]);

  async function createOpp() {
    if (!newOpp.title.trim() || !newOpp.leadId) return;
    setCreatingOpp(true);
    try {
      const stage = category === 'RECRUITING' ? 'SCREENING' : 'PROPOSAL';
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newOpp.title.trim(),
          leadId: newOpp.leadId,
          value: newOpp.value ? parseFloat(newOpp.value) : null,
          stage,
        }),
      });
      if (res.ok) {
        setNewOpp({ title: '', value: '', leadSearch: '', leadId: '' });
        setShowCreate(false);
        load();
      }
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
    if (openId) { setOpenOppId(openId); window.history.replaceState(null, '', '/pipeline'); }
    if (openLeadId) { openLead(openLeadId); window.history.replaceState(null, '', '/pipeline'); }
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

        {/* Create Opportunity Form */}
        {showCreate && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">{category === 'RECRUITING' ? 'Neue Bewerbung' : 'Neue Anfrage'}</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <label className="text-xs text-gray-500 font-medium">Kontakt *</label>
                {newOpp.leadId ? (
                  <div className="flex items-center gap-2 mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50">
                    <span className="flex-1">{leadResults.find(l => l.id === newOpp.leadId)?.firstName} {leadResults.find(l => l.id === newOpp.leadId)?.lastName}</span>
                    <button onClick={() => setNewOpp({ ...newOpp, leadId: '', leadSearch: '' })} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input
                      value={newOpp.leadSearch}
                      onChange={e => setNewOpp({ ...newOpp, leadSearch: e.target.value })}
                      placeholder="Kontakt suchen…"
                      autoFocus
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                    />
                    {leadResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                        {leadResults.map(l => (
                          <button key={l.id} onClick={() => setNewOpp({ ...newOpp, leadId: l.id, leadSearch: '' })}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">{`${l.firstName} ${l.lastName}`.trim()}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Titel *</label>
                <input value={newOpp.title} onChange={e => setNewOpp({ ...newOpp, title: e.target.value })}
                  placeholder={category === 'RECRUITING' ? 'Bewerbungstitel' : 'Anfragetitel'}
                  onKeyDown={e => { if (e.key === 'Enter') createOpp(); }}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 font-medium">Wert (€)</label>
                  <input type="number" value={newOpp.value} onChange={e => setNewOpp({ ...newOpp, value: e.target.value })} placeholder="optional"
                    onKeyDown={e => { if (e.key === 'Enter') createOpp(); }}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                </div>
                <button onClick={createOpp} disabled={creatingOpp || !newOpp.title.trim() || !newOpp.leadId}
                  className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 whitespace-nowrap">
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
