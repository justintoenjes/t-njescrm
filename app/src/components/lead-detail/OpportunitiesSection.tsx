'use client';

import { Plus, Briefcase, ChevronDown, ChevronRight } from 'lucide-react';
import { OPP_STAGE_LABELS, OPP_STAGE_COLORS } from '@/lib/opportunity';
import { TEMP_COLORS } from '@/lib/temperature';
import OppScoreBreakdownPopover from '@/components/OppScoreBreakdown';
import type { LeadFull } from './types';
import type { UseLeadDetailReturn } from './useLeadDetail';

type Props = {
  lead: LeadFull;
  state: UseLeadDetailReturn;
  collapsed: boolean;
  onToggle: () => void;
};

export default function OpportunitiesSection({ lead, state, collapsed, onToggle }: Props) {
  const {
    opportunities, showNewOppForm, setShowNewOppForm, setOpenOppId,
    newOppTitle, setNewOppTitle, newOppValue, setNewOppValue,
    newOppTemplateId, handleTemplateSelect, creatingOpp, createOpportunity,
    templates, isRecruiting,
  } = state;

  const oppLabel = isRecruiting ? 'Bewerbungen' : 'Opportunities';
  const oppLabelSingular = isRecruiting ? 'Bewerbung' : 'Opportunity';

  return (
    <div className="border border-gray-100 rounded-xl">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {oppLabel} ({opportunities.length})
        </span>
        {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setShowNewOppForm(true)}
              className="flex items-center gap-1.5 text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 px-3 py-1.5 rounded-lg transition"
            >
              <Plus size={13} /> Neue {oppLabelSingular}
            </button>
          </div>

          {showNewOppForm && (
            <div className="space-y-2 bg-gray-50 rounded-xl p-3">
              {templates.length > 0 && (
                <select
                  value={newOppTemplateId}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                >
                  <option value="">{isRecruiting ? 'Vorlage auswählen (optional)…' : 'Produkt auswählen (optional)…'}</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.defaultValue != null ? ` — ${t.defaultValue.toLocaleString('de-DE')} €` : ''}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <input
                  value={newOppTitle}
                  onChange={(e) => setNewOppTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createOpportunity(); if (e.key === 'Escape') { setShowNewOppForm(false); setNewOppTitle(''); setNewOppValue(''); } }}
                  placeholder={`Titel der ${oppLabelSingular}…`}
                  autoFocus
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
                <input
                  type="number"
                  value={newOppValue}
                  onChange={(e) => setNewOppValue(e.target.value)}
                  placeholder="Wert €"
                  className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowNewOppForm(false); setNewOppTitle(''); setNewOppValue(''); }}
                  className="text-gray-500 hover:text-gray-700 text-xs px-3 py-1.5 rounded-lg transition"
                >
                  Abbrechen
                </button>
                <button
                  onClick={createOpportunity}
                  disabled={creatingOpp || !newOppTitle.trim()}
                  className="bg-tc-dark hover:bg-tc-dark/90 text-white text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  <Plus size={13} className="inline mr-1" />{oppLabelSingular} anlegen
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {opportunities.length === 0 && !showNewOppForm && (
              <div className="text-center py-6 text-sm text-gray-400">
                <Briefcase size={28} className="mx-auto mb-2 opacity-30" />
                <p>Noch keine {oppLabel}</p>
              </div>
            )}
            {opportunities.map((opp) => (
              <button
                key={opp.id}
                onClick={() => setOpenOppId(opp.id)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{opp.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${OPP_STAGE_COLORS[opp.stage]}`}>
                      {OPP_STAGE_LABELS[opp.stage]}
                    </span>
                    {opp.scoreBreakdown ? (
                      <OppScoreBreakdownPopover
                        score={opp.score ?? 0}
                        breakdown={opp.scoreBreakdown}
                        colorClass={TEMP_COLORS[opp.temperature]}
                      >
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${TEMP_COLORS[opp.temperature]} hover:ring-2 hover:ring-tc-blue/50 transition`}>
                          {opp.score}
                        </span>
                      </OppScoreBreakdownPopover>
                    ) : null}
                    {opp.value != null && (
                      <span className="text-xs text-gray-500">{opp.value.toLocaleString('de-DE')} €</span>
                    )}
                  </div>
                </div>
                <span className="text-gray-300 group-hover:text-gray-500 text-lg">›</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
