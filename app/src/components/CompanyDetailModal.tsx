'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Trash2, Users, Briefcase, Building2, Trophy, XCircle } from 'lucide-react';
import { TEMP_COLORS, Temperature } from '@/lib/temperature';
import { PHASE_LABELS, PHASE_COLORS, LeadPhase } from '@/lib/phase';
import { OPP_STAGE_LABELS, OPP_STAGE_COLORS, TERMINAL_STAGES } from '@/lib/opportunity';
import KPIBar from '@/components/group-detail/KPIBar';
import GroupTimeline from '@/components/group-detail/GroupTimeline';
import GroupNoteInput from '@/components/group-detail/GroupNoteInput';
import { CALL_PATTERN } from '@/components/group-detail/GroupTimeline';
import type { GroupNote, GroupEmail, GroupActivity, NoteTarget } from '@/components/group-detail/types';

type LeadSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phase: LeadPhase;
  score: number;
  temperature: Temperature;
  opportunities: {
    id: string;
    title: string;
    stage: string;
    value: number | null;
  }[];
};

type CompanyData = {
  id: string;
  name: string;
  website: string | null;
  createdAt: string;
  leads: LeadSummary[];
  activeOppCount: number;
  totalPipelineValue: number;
};

type MobileTab = 'timeline' | 'contacts' | 'opportunities' | 'details';

type Props = {
  companyId: string;
  onClose: () => void;
  onUpdate: () => void;
  onOpenLead?: (leadId: string) => void;
  onOpenOpportunity?: (oppId: string) => void;
};

export default function CompanyDetailModal({ companyId, onClose, onUpdate, onOpenLead, onOpenOpportunity }: Props) {
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', website: '' });
  const [saving, setSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('timeline');

  // Timeline
  const [activities, setActivities] = useState<GroupActivity[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  // Note targets
  const [noteTargets, setNoteTargets] = useState<NoteTarget[]>([]);

  const fetchCompany = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/companies/${companyId}`);
    if (!res.ok) { setLoading(false); return; }
    const data: CompanyData = await res.json();
    setCompany(data);
    setForm({ name: data.name, website: data.website ?? '' });

    // Build note targets
    const targets: NoteTarget[] = [];
    data.leads.forEach(l => {
      targets.push({ type: 'lead', label: l.name, id: l.id });
      l.opportunities
        .filter(o => !TERMINAL_STAGES.includes(o.stage as any))
        .forEach(o => targets.push({ type: 'opportunity', label: `${o.title} (${l.name})`, id: o.id }));
    });
    setNoteTargets(targets);
    setLoading(false);
  }, [companyId]);

  const fetchTimeline = useCallback(async () => {
    setTimelineLoading(true);
    const res = await fetch(`/api/companies/${companyId}/timeline`);
    if (!res.ok) { setTimelineLoading(false); return; }
    const data = await res.json();

    const notes: GroupNote[] = data.notes ?? [];
    const emails: GroupEmail[] = data.emails ?? [];

    const acts: GroupActivity[] = [
      ...notes
        .filter((n: GroupNote) => !CALL_PATTERN.test(n.content))
        .map((n: GroupNote) => ({ type: 'note' as const, id: n.id, date: new Date(n.createdAt), note: n })),
      ...notes
        .filter((n: GroupNote) => CALL_PATTERN.test(n.content))
        .map((n: GroupNote) => ({ type: 'call' as const, id: n.id, date: new Date(n.createdAt), note: n })),
      ...emails.map((e: GroupEmail) => ({ type: 'email' as const, id: e.id, date: new Date(e.date), email: e })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    setActivities(acts);
    setTimelineLoading(false);
  }, [companyId]);

  useEffect(() => { fetchCompany(); fetchTimeline(); }, [fetchCompany, fetchTimeline]);

  async function saveChanges() {
    setSaving(true);
    await fetch(`/api/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, website: form.website || null }),
    });
    setSaving(false);
    fetchCompany();
    onUpdate();
  }

  async function deleteCompany() {
    if (!confirm(`Firma "${company?.name}" wirklich löschen? Kontakte bleiben erhalten.`)) return;
    await fetch(`/api/companies/${companyId}`, { method: 'DELETE' });
    onClose();
    onUpdate();
  }

  async function handleAddNote(content: string, target: NoteTarget) {
    const url = target.type === 'lead'
      ? `/api/leads/${target.id}/notes`
      : `/api/opportunities/${target.id}/notes`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    fetchTimeline();
  }

  const allOpps = company?.leads.flatMap(l =>
    l.opportunities.map(o => ({ ...o, leadName: l.name }))
  ) ?? [];
  const activeOpps = allOpps.filter(o => !TERMINAL_STAGES.includes(o.stage as any));
  const wonCount = allOpps.filter(o => o.stage === 'WON' || o.stage === 'HIRED').length;
  const lostCount = allOpps.filter(o => o.stage === 'LOST' || o.stage === 'REJECTED').length;

  const kpis = company ? [
    { label: 'Kontakte', value: company.leads.length, color: 'bg-gray-50 text-gray-700 border-gray-200' },
    { label: 'Aktive Opps', value: activeOpps.length, color: 'bg-teal-50 text-teal-700 border-teal-200' },
    { label: 'Pipeline', value: `${company.totalPipelineValue.toLocaleString('de-DE')} €`, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    ...(wonCount > 0 ? [{ label: 'Gewonnen', value: wonCount, color: 'bg-green-50 text-green-700 border-green-200' }] : []),
    ...(lostCount > 0 ? [{ label: 'Verloren', value: lostCount, color: 'bg-red-50 text-red-700 border-red-200' }] : []),
  ] : [];

  const MOBILE_TABS: { key: MobileTab; label: string }[] = [
    { key: 'timeline', label: 'Aktivität' },
    { key: 'contacts', label: `Kontakte (${company?.leads.length ?? 0})` },
    { key: 'opportunities', label: `Opps (${allOpps.length})` },
    { key: 'details', label: 'Details' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 lg:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white lg:rounded-2xl shadow-2xl w-full h-full lg:w-[95vw] lg:max-w-7xl lg:h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Building2 size={20} className="text-gray-400 shrink-0" />
            <h2 className="text-lg font-bold truncate">{company?.name ?? 'Laden…'}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={deleteCompany} className="text-red-400 hover:text-red-600 p-1 rounded" title="Löschen">
              <Trash2 size={18} />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="lg:hidden flex border-b px-4 overflow-x-auto shrink-0">
          {MOBILE_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setMobileTab(t.key)}
              className={`py-2.5 px-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap
                ${mobileTab === t.key
                  ? 'border-tc-dark text-tc-dark'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {loading ? (
            <p className="w-full text-center py-12 text-gray-400">Laden…</p>
          ) : (
            <>
              {/* Left Panel */}
              <div className={`w-full lg:w-[420px] lg:border-r lg:flex flex-col overflow-y-auto shrink-0 ${
                mobileTab === 'timeline' ? 'hidden lg:flex' : mobileTab === 'contacts' || mobileTab === 'opportunities' || mobileTab === 'details' ? 'flex lg:flex' : 'hidden lg:flex'
              }`}>
                <div className="p-4 sm:p-5 space-y-5">
                  {/* KPIs */}
                  <KPIBar kpis={kpis} />

                  {/* Contacts */}
                  <div className={`${mobileTab !== 'contacts' && mobileTab !== 'details' ? 'hidden lg:block' : ''}`}>
                    {(mobileTab === 'contacts' || mobileTab === 'details' || true) && (
                      <>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Kontakte ({company?.leads.length ?? 0})
                        </h3>
                        <div className="space-y-2">
                          {company?.leads.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-4">Keine Kontakte</p>
                          )}
                          {company?.leads.map(lead => {
                            const leadActiveOpps = lead.opportunities.filter(o => !TERMINAL_STAGES.includes(o.stage as any));
                            return (
                              <div
                                key={lead.id}
                                onClick={() => onOpenLead?.(lead.id)}
                                className={`flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl ${onOpenLead ? 'cursor-pointer hover:bg-tc-blue/10 transition' : ''}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${TEMP_COLORS[lead.temperature]}`}>
                                      {lead.score}
                                    </span>
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[lead.phase]}`}>
                                      {PHASE_LABELS[lead.phase]}
                                    </span>
                                    {leadActiveOpps.length > 0 && (
                                      <span className="text-xs text-teal-600">{leadActiveOpps.length} Opp(s)</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Opportunities */}
                  <div className={`${mobileTab !== 'opportunities' && mobileTab !== 'details' ? 'hidden lg:block' : ''}`}>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Opportunities ({allOpps.length})
                    </h3>
                    <div className="space-y-2">
                      {allOpps.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-4">Keine Opportunities</p>
                      )}
                      {allOpps.map(opp => (
                        <div
                          key={opp.id}
                          onClick={() => onOpenOpportunity?.(opp.id)}
                          className={`flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl ${onOpenOpportunity ? 'cursor-pointer hover:bg-tc-blue/10 transition' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{opp.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${OPP_STAGE_COLORS[opp.stage as keyof typeof OPP_STAGE_COLORS] ?? ''}`}>
                                {OPP_STAGE_LABELS[opp.stage as keyof typeof OPP_STAGE_LABELS] ?? opp.stage}
                              </span>
                              {opp.value != null && (
                                <span className="text-xs text-gray-500">{opp.value.toLocaleString('de-DE')} €</span>
                              )}
                              <span className="text-xs text-gray-400">via {opp.leadName}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Details (edit form) - only on mobile details tab or desktop */}
                  <div className={`${mobileTab !== 'details' ? 'hidden lg:block' : ''}`}>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Firmendetails</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Firmenname</label>
                        <input
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Website</label>
                        <input
                          value={form.website}
                          onChange={(e) => setForm({ ...form, website: e.target.value })}
                          placeholder="https://…"
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={saveChanges}
                          disabled={saving}
                          className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                        >
                          <Save size={14} /> {saving ? 'Speichern…' : 'Speichern'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel - Timeline */}
              <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab !== 'timeline' ? 'hidden lg:flex' : 'flex'}`}>
                <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-gray-100">
                  <GroupNoteInput targets={noteTargets} onAddNote={handleAddNote} />
                </div>
                <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
                  <GroupTimeline activities={activities} loading={timelineLoading} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
