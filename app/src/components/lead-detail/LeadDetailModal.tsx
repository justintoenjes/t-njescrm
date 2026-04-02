'use client';

import { useState } from 'react';
import { X, Trash2, Archive, ArchiveRestore, Briefcase } from 'lucide-react';
import { TEMP_COLORS } from '@/lib/temperature';
import { PHASE_LABELS, PHASE_COLORS } from '@/lib/phase';
import ScoreBreakdownPopover from '@/components/ScoreBreakdown';
import OpportunityModal from '@/components/OpportunityModal';
import type { LeadFull, UserOption } from './types';
import { useLeadDetail } from './useLeadDetail';
import AboutSection from './AboutSection';
import ReachabilitySection from './ReachabilitySection';
import OpportunitiesSection from './OpportunitiesSection';
import TasksSection from './TasksSection';
import RightPanel from './RightPanel';

type Props = {
  lead: LeadFull;
  users: UserOption[];
  isAdmin: boolean;
  onClose: () => void;
  onUpdate: (lead: LeadFull) => void;
  onDelete: (id: string) => void;
};

type MobileTab = 'timeline' | 'details' | 'opportunities' | 'tasks';

export default function LeadDetailModal({ lead, users, isAdmin, onClose, onUpdate, onDelete }: Props) {
  const state = useLeadDetail({ lead, onUpdate, onDelete, onClose });
  const { openOppId, setOpenOppId, opportunities, handleOppUpdate, handleOppDelete, activeOppCount, toggleArchived, deleteLead } = state;

  // Collapsible sections (desktop)
  const [aboutOpen, setAboutOpen] = useState(true);
  const [oppsOpen, setOppsOpen] = useState(true);
  const [tasksOpen, setTasksOpen] = useState(true);

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<MobileTab>('timeline');

  const MOBILE_TABS: { key: MobileTab; label: string }[] = [
    { key: 'timeline', label: 'Aktivität' },
    { key: 'details', label: 'Details' },
    { key: 'opportunities', label: `${lead.category === 'RECRUITING' ? 'Bewerbungen' : 'Opps'} (${opportunities.length})` },
    { key: 'tasks', label: 'Aufgaben' },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 lg:p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white lg:rounded-2xl shadow-2xl w-full h-full lg:w-[95vw] lg:max-w-7xl lg:h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 border-b shrink-0">
            <div className="flex items-center gap-2 lg:gap-3 flex-wrap min-w-0">
              <h2 className="text-base lg:text-lg font-bold truncate">{`${lead.firstName} ${lead.lastName}`.trim()}</h2>
              {lead.scoreBreakdown ? (
                <ScoreBreakdownPopover
                  score={lead.score}
                  breakdown={lead.scoreBreakdown}
                  colorClass={TEMP_COLORS[lead.temperature]}
                >
                  <span className={`text-xs font-bold px-2 py-1 rounded-full border ${TEMP_COLORS[lead.temperature]} hover:ring-2 hover:ring-tc-blue/50 transition`}>
                    {lead.score}
                  </span>
                </ScoreBreakdownPopover>
              ) : (
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${TEMP_COLORS[lead.temperature]}`}>
                  {lead.score}
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${PHASE_COLORS[lead.phase]}`}>
                {PHASE_LABELS[lead.phase]}
              </span>
              {activeOppCount > 0 && (
                <span className="hidden sm:flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-teal-100 text-teal-700">
                  <Briefcase size={11} /> {activeOppCount} aktiv
                </span>
              )}
              {lead.companyRef && (
                <span className="hidden sm:inline text-xs text-gray-500">{lead.companyRef.name}</span>
              )}
            </div>
            <div className="flex items-center gap-1 lg:gap-2 shrink-0">
              <button
                onClick={toggleArchived}
                className={`p-1 rounded transition ${lead.archived ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}`}
                title={lead.archived ? 'Wiederherstellen' : 'Archivieren'}
              >
                {lead.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
              </button>
              {isAdmin && (
                <button onClick={deleteLead} className="text-red-400 hover:text-red-600 p-1 rounded" title="Löschen">
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Mobile Tabs — only visible below lg */}
          <div className="flex border-b px-2 overflow-x-auto lg:hidden shrink-0">
            {MOBILE_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setMobileTab(t.key)}
                className={`py-2.5 px-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0
                  ${mobileTab === t.key
                    ? 'border-tc-dark text-tc-dark'
                    : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Desktop: Two-column layout (lg+) */}
          <div className="hidden lg:flex flex-1 min-h-0">
            {/* Left Panel */}
            <div className="w-[420px] shrink-0 border-r border-gray-100 overflow-y-auto p-4 space-y-3">
              <AboutSection
                lead={lead}
                isAdmin={isAdmin}
                users={users}
                state={state}
                collapsed={!aboutOpen}
                onToggle={() => setAboutOpen(!aboutOpen)}
              />
              <ReachabilitySection state={state} />
              <OpportunitiesSection
                lead={lead}
                state={state}
                collapsed={!oppsOpen}
                onToggle={() => setOppsOpen(!oppsOpen)}
              />
              <TasksSection
                state={state}
                collapsed={!tasksOpen}
                onToggle={() => setTasksOpen(!tasksOpen)}
              />
            </div>

            {/* Right Panel — Timeline */}
            <div className="flex-1 min-w-0">
              <RightPanel lead={lead} state={state} />
            </div>
          </div>

          {/* Mobile: Tab content (below lg) */}
          <div className="flex-1 min-h-0 overflow-y-auto lg:hidden">
            {mobileTab === 'timeline' && (
              <RightPanel lead={lead} state={state} />
            )}
            {mobileTab === 'details' && (
              <div className="p-4 space-y-3">
                <AboutSection
                  lead={lead}
                  isAdmin={isAdmin}
                  users={users}
                  state={state}
                  collapsed={false}
                  onToggle={() => {}}
                />
                <ReachabilitySection state={state} />
              </div>
            )}
            {mobileTab === 'opportunities' && (
              <div className="p-4">
                <OpportunitiesSection
                  lead={lead}
                  state={state}
                  collapsed={false}
                  onToggle={() => {}}
                />
              </div>
            )}
            {mobileTab === 'tasks' && (
              <div className="p-4">
                <TasksSection
                  state={state}
                  collapsed={false}
                  onToggle={() => {}}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* OpportunityModal overlay */}
      {openOppId && (
        <OpportunityModal
          opportunityId={openOppId}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setOpenOppId(null)}
          onUpdate={handleOppUpdate}
          onDelete={handleOppDelete}
          showBack
          siblingOpportunities={opportunities.map(o => ({ id: o.id, title: o.title }))}
        />
      )}
    </>
  );
}
