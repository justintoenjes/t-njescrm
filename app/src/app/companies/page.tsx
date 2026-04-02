'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, Plus, Building2, Users, Briefcase, ChevronDown, ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import CompanyDetailModal from '@/components/CompanyDetailModal';
import LeadModal, { LeadFull } from '@/components/LeadModal';
import OpportunityModal from '@/components/OpportunityModal';
import { PHASE_LABELS, PHASE_COLORS, LeadPhase } from '@/lib/phase';
import { TEMP_COLORS, Temperature } from '@/lib/temperature';

type CompanyRow = {
  id: string;
  name: string;
  website: string | null;
  createdAt: string;
  leadCount: number;
  activeOppCount: number;
  totalPipelineValue: number;
  bestPhase: LeadPhase | null;
  tempDistribution: { hot: number; warm: number; cold: number };
};

type CompanyDetail = {
  id: string;
  name: string;
  leads: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    phase: LeadPhase;
    score: number;
    temperature: Temperature;
    lastContactedAt: string | null;
    assignedTo: { id: string; name: string } | null;
    opportunities: { id: string; stage: string; value: number | null }[];
  }[];
};

export default function CompaniesPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadFull | null>(null);
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<CompanyDetail | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const isAdmin = session?.user?.role === 'ADMIN';

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/login');
  }, [authStatus, router]);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const res = await fetch(`/api/companies?${params}`);
    setCompanies(await res.json());
    setLoading(false);
  }, [search]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const t = setTimeout(fetchCompanies, 300);
    return () => clearTimeout(t);
  }, [fetchCompanies, authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    fetch('/api/users').then(r => r.json()).then(setUsers);
  }, [authStatus]);

  async function toggleExpand(companyId: string) {
    if (expandedId === companyId) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(companyId);
    setExpandedLoading(true);
    const res = await fetch(`/api/companies/${companyId}`);
    if (res.ok) setExpandedData(await res.json());
    setExpandedLoading(false);
  }

  async function openLead(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}`);
    if (res.ok) setSelectedLead(await res.json());
  }

  async function createCompany() {
    if (!newName.trim()) return;
    setCreating(true);
    await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName('');
    setShowCreate(false);
    setCreating(false);
    fetchCompanies();
  }

  function formatDate(d: string | null) {
    if (!d) return '–';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const TEMP_DOT: Record<Temperature, string> = { hot: 'bg-red-500', warm: 'bg-amber-400', cold: 'bg-blue-400' };

  if (authStatus === 'loading') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Firma suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue w-52"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <Plus size={16} /> Neue Firma
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-3 py-3 w-8"></th>
                <th className="px-3 py-3">Firma</th>
                <th className="px-3 py-3">Kontakte</th>
                <th className="px-3 py-3">Aktive Opps</th>
                <th className="px-3 py-3">Pipeline-Wert</th>
                <th className="px-3 py-3">Beste Phase</th>
                <th className="px-3 py-3">Temperatur</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Laden…</td></tr>
              )}
              {!loading && companies.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Keine Firmen gefunden</td></tr>
              )}
              {companies.map((c) => {
                const isExpanded = expandedId === c.id;
                return (
                  <>
                    <tr
                      key={c.id}
                      onClick={() => toggleExpand(c.id)}
                      className={`border-b border-gray-100 hover:bg-tc-blue/10 cursor-pointer transition ${isExpanded ? 'bg-tc-blue/5' : ''}`}
                    >
                      <td className="px-3 py-3.5 text-gray-400">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </td>
                      <td className="px-3 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditId(c.id); }}
                          className="flex items-center gap-2 hover:text-tc-blue transition"
                        >
                          <Building2 size={14} className="text-gray-400 shrink-0" />
                          <span className="font-medium text-gray-900 hover:text-tc-blue">{c.name}</span>
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <Users size={12} /> {c.leadCount}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        {c.activeOppCount > 0 ? (
                          <span className="flex items-center gap-1 text-xs text-teal-700">
                            <Briefcase size={12} /> {c.activeOppCount}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">–</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-gray-600">
                        {c.totalPipelineValue > 0
                          ? `${c.totalPipelineValue.toLocaleString('de-DE')} €`
                          : '–'}
                      </td>
                      <td className="px-3 py-3.5">
                        {c.bestPhase ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[c.bestPhase] ?? ''}`}>
                            {PHASE_LABELS[c.bestPhase] ?? c.bestPhase}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">–</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        {c.leadCount > 0 ? (
                          <div className="flex items-center gap-1.5">
                            {c.tempDistribution.hot > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-red-600">
                                <span className={`w-2 h-2 rounded-full ${TEMP_DOT.hot}`} />{c.tempDistribution.hot}
                              </span>
                            )}
                            {c.tempDistribution.warm > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-amber-600">
                                <span className={`w-2 h-2 rounded-full ${TEMP_DOT.warm}`} />{c.tempDistribution.warm}
                              </span>
                            )}
                            {c.tempDistribution.cold > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-blue-600">
                                <span className={`w-2 h-2 rounded-full ${TEMP_DOT.cold}`} />{c.tempDistribution.cold}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">–</span>
                        )}
                      </td>
                    </tr>
                    {/* Expanded leads sub-table */}
                    {isExpanded && (
                      <tr key={`${c.id}-expanded`} className="bg-gray-50/50">
                        <td colSpan={7} className="px-6 py-3">
                          {expandedLoading ? (
                            <p className="text-sm text-gray-400 py-4 text-center">Laden…</p>
                          ) : expandedData?.leads.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">Keine Kontakte</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                  <th className="px-3 py-2">Score</th>
                                  <th className="px-3 py-2">Name</th>
                                  <th className="px-3 py-2">Phase</th>
                                  <th className="px-3 py-2">Opps</th>
                                  <th className="px-3 py-2">Letzter Kontakt</th>
                                  <th className="px-3 py-2">Zugewiesen</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedData?.leads.map((lead) => {
                                  const activeOpps = lead.opportunities.filter((o: any) => !['WON', 'LOST', 'HIRED', 'REJECTED'].includes(o.stage));
                                  return (
                                    <tr
                                      key={lead.id}
                                      onClick={(e) => { e.stopPropagation(); openLead(lead.id); }}
                                      className="hover:bg-white cursor-pointer transition border-b border-gray-100 last:border-0"
                                    >
                                      <td className="px-3 py-2">
                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${TEMP_COLORS[lead.temperature]}`}>
                                          {lead.score}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-medium text-gray-900">{`${lead.firstName} ${lead.lastName}`.trim()}</td>
                                      <td className="px-3 py-2">
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[lead.phase] ?? ''}`}>
                                          {PHASE_LABELS[lead.phase] ?? lead.phase}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        {activeOpps.length > 0 ? (
                                          <span className="flex items-center gap-1 text-xs text-teal-700">
                                            <Briefcase size={12} /> {activeOpps.length}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-gray-300">–</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-gray-500 text-xs">
                                        {formatDate(lead.lastContactedAt)}
                                      </td>
                                      <td className="px-3 py-2 text-gray-500 text-xs">
                                        {lead.assignedTo?.name ?? '–'}
                                      </td>
                                    </tr>
                                  );
                                })}
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
          {!loading && (
            <div className="px-5 py-2 border-t border-gray-100 text-xs text-gray-400">
              {companies.length} Firma{companies.length !== 1 ? 'en' : ''}
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold">Neue Firma</h2>
            <input
              placeholder="Firmenname *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createCompany(); }}
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Abbrechen
              </button>
              <button
                onClick={createCompany}
                disabled={creating || !newName.trim()}
                className="bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {creating ? 'Erstellen…' : 'Erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Detail Modal */}
      {editId && (
        <CompanyDetailModal
          companyId={editId}
          onClose={() => setEditId(null)}
          onUpdate={fetchCompanies}
          onOpenLead={(leadId) => { setEditId(null); openLead(leadId); }}
          onOpenOpportunity={(oppId) => { setEditId(null); setSelectedOppId(oppId); }}
        />
      )}

      {/* Lead Modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          users={users}
          isAdmin={isAdmin ?? false}
          onClose={() => setSelectedLead(null)}
          onUpdate={(updated) => { setSelectedLead(updated); fetchCompanies(); }}
          onDelete={() => { setSelectedLead(null); fetchCompanies(); }}
        />
      )}

      {/* Opportunity Modal */}
      {selectedOppId && (
        <OpportunityModal
          opportunityId={selectedOppId}
          users={users}
          isAdmin={isAdmin ?? false}
          onClose={() => setSelectedOppId(null)}
          onUpdate={() => fetchCompanies()}
          onDelete={() => { setSelectedOppId(null); fetchCompanies(); }}
        />
      )}
    </div>
  );
}
