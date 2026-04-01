'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Plus, Trash2, Package, Briefcase, X, Save, ChevronDown, ChevronRight, Users } from 'lucide-react';
import Header from '@/components/Header';
import LeadModal, { LeadFull } from '@/components/LeadModal';
import OpportunityModal from '@/components/OpportunityModal';
import TemplateDetailModal from '@/components/TemplateDetailModal';
import { useCategory } from '@/lib/category-context';
import { OPP_STAGE_LABELS, OPP_STAGE_COLORS } from '@/lib/opportunity';
import { PHASE_LABELS, PHASE_COLORS, LeadPhase } from '@/lib/phase';
import { TEMP_COLORS, Temperature } from '@/lib/temperature';

type Template = {
  id: string;
  name: string;
  description: string | null;
  defaultValue: number | null;
  category: 'VERTRIEB' | 'RECRUITING';
  _count: { opportunities: number };
  candidateCount: number;
  phaseDistribution: Record<string, number>;
};

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phase: LeadPhase;
  score: number;
  temperature: Temperature;
  lastContactedAt: string | null;
  assignedTo: { id: string; name: string } | null;
  oppStage: string;
};

type TemplateDetail = {
  id: string;
  name: string;
  candidates: Candidate[];
};

export default function TemplatesPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { category } = useCategory();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', defaultValue: '' });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<TemplateDetail | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadFull | null>(null);
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);

  const isRecruiting = category === 'RECRUITING';
  const label = isRecruiting ? 'Stellen' : 'Produkte';
  const labelSingular = isRecruiting ? 'Stelle' : 'Produkt';

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/login');
  }, [authStatus, router]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/templates?category=${category}`);
    setTemplates(await res.json());
    setLoading(false);
  }, [category]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    fetchTemplates();
  }, [fetchTemplates, authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    fetch('/api/users').then(r => r.json()).then(setUsers);
  }, [authStatus]);

  async function toggleExpand(templateId: string) {
    if (expandedId === templateId) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(templateId);
    setExpandedLoading(true);
    const res = await fetch(`/api/templates/${templateId}`);
    if (res.ok) setExpandedData(await res.json());
    setExpandedLoading(false);
  }

  async function openLead(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}`);
    if (res.ok) setSelectedLead(await res.json());
  }

  function openNew() {
    setForm({ name: '', description: '', defaultValue: '' });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setForm({
      name: t.name,
      description: t.description ?? '',
      defaultValue: t.defaultValue != null ? String(t.defaultValue) : '',
    });
    setEditId(t.id);
    setShowForm(true);
  }

  async function saveTemplate() {
    if (!form.name.trim()) return;
    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      defaultValue: form.defaultValue ? parseFloat(form.defaultValue) : null,
      category,
    };

    if (editId) {
      await fetch(`/api/templates/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    setShowForm(false);
    setEditId(null);
    setSaving(false);
    fetchTemplates();
  }

  async function deleteTemplate(id: string) {
    if (!confirm(`${labelSingular} wirklich löschen?`)) return;
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function formatDate(d: string | null) {
    if (!d) return '–';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Phase distribution badges for recruiting
  const STAGE_ORDER = ['SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
  const VERTRIEB_STAGE_ORDER = ['PROPOSAL', 'NEGOTIATION', 'CLOSING', 'WON', 'LOST'];

  function renderPhaseDistribution(dist: Record<string, number>) {
    const order = isRecruiting ? STAGE_ORDER : VERTRIEB_STAGE_ORDER;
    const entries = order.filter(s => (dist[s] ?? 0) > 0);
    if (entries.length === 0) return <span className="text-xs text-gray-300">–</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {entries.map(stage => (
          <span
            key={stage}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${OPP_STAGE_COLORS[stage as keyof typeof OPP_STAGE_COLORS] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {dist[stage]}× {OPP_STAGE_LABELS[stage as keyof typeof OPP_STAGE_LABELS] ?? stage}
          </span>
        ))}
      </div>
    );
  }

  const colCount = isRecruiting ? (isAdmin ? 6 : 5) : (isAdmin ? 4 : 3);

  if (authStatus === 'loading') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className={`${isRecruiting ? 'max-w-7xl' : 'max-w-4xl'} mx-auto px-4 py-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isRecruiting ? 'bg-emerald-100' : 'bg-teal-100'}`}>
              {isRecruiting ? <Briefcase size={20} className="text-emerald-600" /> : <Package size={20} className="text-teal-600" />}
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{label}</h1>
              <p className="text-sm text-gray-500">
                {isRecruiting ? 'Zentrale Stellenvorlagen für Kandidaten' : 'Zentrale Produktvorlagen für Opportunities'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={openNew}
              className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition text-white ${isRecruiting ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-tc-dark hover:bg-tc-dark/90'}`}
            >
              <Plus size={15} /> {labelSingular} anlegen
            </button>
          )}
        </div>

        {/* Template List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {isRecruiting && <th className="px-3 py-3 w-8"></th>}
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">{isRecruiting ? 'Gehalt' : 'Wert'} (€)</th>
                {isRecruiting ? (
                  <>
                    <th className="px-4 py-3">Kandidaten</th>
                    <th className="px-4 py-3">Phasen-Verteilung</th>
                  </>
                ) : (
                  <th className="px-4 py-3">Verwendet</th>
                )}
                {isAdmin && <th className="px-4 py-3 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={colCount} className="text-center py-12 text-gray-400">Laden...</td></tr>
              )}
              {!loading && templates.length === 0 && (
                <tr><td colSpan={colCount} className="text-center py-12 text-gray-400">Keine {label} angelegt</td></tr>
              )}
              {templates.map(t => {
                const isExpanded = expandedId === t.id && isRecruiting;
                return (
                  <>
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-emerald-50/50' : ''}`}
                    >
                      {isRecruiting && (
                        <td className="px-3 py-3.5 text-gray-400">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>
                      )}
                      <td className="px-4 py-3.5 font-medium text-gray-900">{t.name}</td>
                      <td className="px-4 py-3.5 text-gray-500">
                        {t.defaultValue != null ? `${t.defaultValue.toLocaleString('de-DE')} €` : '–'}
                      </td>
                      {isRecruiting ? (
                        <>
                          <td className="px-4 py-3.5">
                            <span className="flex items-center gap-1 text-xs text-emerald-700">
                              <Users size={12} /> {t.candidateCount}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {renderPhaseDistribution(t.phaseDistribution)}
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3.5 text-gray-500">{t._count.opportunities}×</td>
                      )}
                      {isAdmin && (
                        <td className="px-4 py-3.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}
                            className="text-gray-400 hover:text-red-600 p-1 rounded transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                    {/* Expanded candidates sub-table (Recruiting only) */}
                    {isExpanded && (
                      <tr key={`${t.id}-expanded`} className="bg-emerald-50/30">
                        <td colSpan={colCount} className="px-6 py-3">
                          {expandedLoading ? (
                            <p className="text-sm text-gray-400 py-4 text-center">Laden…</p>
                          ) : expandedData?.candidates.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">Keine Kandidaten</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                  <th className="px-3 py-2">Score</th>
                                  <th className="px-3 py-2">Kandidat</th>
                                  <th className="px-3 py-2">Status (Stelle)</th>
                                  <th className="px-3 py-2">Phase (gesamt)</th>
                                  <th className="px-3 py-2">Letzter Kontakt</th>
                                  <th className="px-3 py-2">Zugewiesen</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedData?.candidates.map((c) => (
                                  <tr
                                    key={c.id}
                                    onClick={(e) => { e.stopPropagation(); openLead(c.id); }}
                                    className="hover:bg-white cursor-pointer transition border-b border-gray-100 last:border-0"
                                  >
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${TEMP_COLORS[c.temperature]}`}>
                                        {c.score}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div>
                                        <span className="font-medium text-gray-900">{c.name}</span>
                                        {c.email && <span className="text-xs text-gray-400 ml-2">{c.email}</span>}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${OPP_STAGE_COLORS[c.oppStage as keyof typeof OPP_STAGE_COLORS] ?? ''}`}>
                                        {OPP_STAGE_LABELS[c.oppStage as keyof typeof OPP_STAGE_LABELS] ?? c.oppStage}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[c.phase] ?? ''}`}>
                                        {PHASE_LABELS[c.phase] ?? c.phase}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-500 text-xs">
                                      {formatDate(c.lastContactedAt)}
                                    </td>
                                    <td className="px-3 py-2 text-gray-500 text-xs">
                                      {c.assignedTo?.name ?? '–'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Create/Edit Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editId ? `${labelSingular} bearbeiten` : `${labelSingular} anlegen`}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); }}
                  autoFocus
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Beschreibung</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">{isRecruiting ? 'Gehalt' : 'Wert'} (€)</label>
                <input
                  type="number"
                  value={form.defaultValue}
                  onChange={e => setForm({ ...form, defaultValue: e.target.value })}
                  placeholder="optional"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Abbrechen
              </button>
              <button
                onClick={saveTemplate}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                <Save size={14} /> {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Detail Modal */}
      {selectedTemplateId && (
        <TemplateDetailModal
          templateId={selectedTemplateId}
          isAdmin={isAdmin ?? false}
          onClose={() => setSelectedTemplateId(null)}
          onUpdate={fetchTemplates}
          onOpenLead={(leadId) => { setSelectedTemplateId(null); openLead(leadId); }}
          onOpenOpportunity={(oppId) => { setSelectedTemplateId(null); setSelectedOppId(oppId); }}
        />
      )}

      {/* Lead Modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          users={users}
          isAdmin={isAdmin ?? false}
          onClose={() => setSelectedLead(null)}
          onUpdate={(updated) => { setSelectedLead(updated); fetchTemplates(); }}
          onDelete={() => { setSelectedLead(null); fetchTemplates(); }}
        />
      )}

      {/* Opportunity Modal */}
      {selectedOppId && (
        <OpportunityModal
          opportunityId={selectedOppId}
          users={users}
          isAdmin={isAdmin ?? false}
          onClose={() => setSelectedOppId(null)}
          onUpdate={() => fetchTemplates()}
          onDelete={() => { setSelectedOppId(null); fetchTemplates(); }}
        />
      )}
    </div>
  );
}
