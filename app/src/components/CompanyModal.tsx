'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2, Users, Briefcase, Building2 } from 'lucide-react';
import { TEMP_COLORS, Temperature } from '@/lib/temperature';
import { PHASE_LABELS, PHASE_COLORS, LeadPhase } from '@/lib/phase';
import { OPP_STAGE_LABELS, OPP_STAGE_COLORS } from '@/lib/opportunity';

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

type CompanyDetail = {
  id: string;
  name: string;
  website: string | null;
  createdAt: string;
  leads: LeadSummary[];
  activeOppCount: number;
  totalPipelineValue: number;
};

type Tab = 'info' | 'contacts' | 'opportunities';

type Props = {
  companyId: string;
  onClose: () => void;
  onUpdate: () => void;
  onOpenLead?: (leadId: string) => void;
  onOpenOpportunity?: (oppId: string) => void;
};

export default function CompanyModal({ companyId, onClose, onUpdate, onOpenLead, onOpenOpportunity }: Props) {
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('contacts');
  const [form, setForm] = useState({ name: '', website: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/companies/${companyId}`)
      .then(r => r.json())
      .then(data => {
        setCompany(data);
        setForm({ name: data.name, website: data.website ?? '' });
        setLoading(false);
      });
  }, [companyId]);

  async function saveChanges() {
    setSaving(true);
    await fetch(`/api/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, website: form.website || null }),
    });
    setSaving(false);
    onUpdate();
  }

  async function deleteCompany() {
    if (!confirm(`Firma "${company?.name}" wirklich löschen? Kontakte bleiben erhalten.`)) return;
    await fetch(`/api/companies/${companyId}`, { method: 'DELETE' });
    onClose();
    onUpdate();
  }

  const allOpps = company?.leads.flatMap(l =>
    l.opportunities.map(o => ({ ...o, leadName: l.name }))
  ) ?? [];

  const TABS: { key: Tab; label: string }[] = [
    { key: 'contacts', label: `Kontakte (${company?.leads.length ?? 0})` },
    { key: 'opportunities', label: `Opportunities (${allOpps.length})` },
    { key: 'info', label: 'Details' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Building2 size={20} className="text-gray-400" />
            <h2 className="text-lg font-bold">{company?.name ?? 'Laden…'}</h2>
            {company && (
              <>
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                  <Users size={11} /> {company.leads.length}
                </span>
                {company.activeOppCount > 0 && (
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-teal-100 text-teal-700">
                    <Briefcase size={11} /> {company.activeOppCount} aktiv
                  </span>
                )}
                {company.totalPipelineValue > 0 && (
                  <span className="text-xs text-gray-500">
                    {company.totalPipelineValue.toLocaleString('de-DE')} €
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={deleteCompany} className="text-red-400 hover:text-red-600 p-1 rounded" title="Löschen">
              <Trash2 size={18} />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`py-2.5 px-4 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap
                ${tab === t.key
                  ? 'border-tc-dark text-tc-dark'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-center py-12 text-gray-400">Laden…</p>}

          {/* Contacts Tab */}
          {!loading && tab === 'contacts' && (
            <div className="p-6 space-y-2">
              {company?.leads.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Keine Kontakte</p>
              )}
              {company?.leads.map(lead => {
                const activeOpps = lead.opportunities.filter(o => o.stage !== 'WON' && o.stage !== 'LOST');
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
                        {activeOpps.length > 0 && (
                          <span className="text-xs text-teal-600">{activeOpps.length} Opp(s)</span>
                        )}
                        {lead.email && <span className="text-xs text-gray-400">{lead.email}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Opportunities Tab */}
          {!loading && tab === 'opportunities' && (
            <div className="p-6 space-y-2">
              {allOpps.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Keine Opportunities</p>
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
          )}

          {/* Info Tab */}
          {!loading && tab === 'info' && (
            <div className="p-6 space-y-4">
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
          )}
        </div>
      </div>
    </div>
  );
}
