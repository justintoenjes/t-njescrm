'use client';

import { useState } from 'react';
import { Send, Brain } from 'lucide-react';
import type { LeadFull, TimelineFilter, Activity } from './types';
import type { UseLeadDetailReturn } from './useLeadDetail';
import TimelineFilters from './TimelineFilters';
import TimelineEntry from './TimelineEntry';
import NoteInput from './NoteInput';
import FollowUpCard from './FollowUpCard';
import AISummaryCard from './AISummaryCard';

type Props = {
  lead: LeadFull;
  state: UseLeadDetailReturn;
};

function formatDate(d: string | null) {
  if (!d) return '–';
  return new Date(d).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function RightPanel({ lead, state }: Props) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const {
    activities, mergedNotes, moveTargets,
    handleMoveNote, deleteNote,
    fetchFollowUp, followUpLoading, followUp,
    fetchAI, aiLoading,
    emailsLoaded, emailsError, emailsSyncing,
  } = state;

  const filteredActivities = filter === 'all'
    ? activities
    : activities.filter(a => {
        if (filter === 'notes') return a.type === 'note';
        if (filter === 'emails') return a.type === 'email';
        if (filter === 'calls') return a.type === 'call';
        return true;
      });

  const counts = {
    all: activities.length,
    notes: activities.filter(a => a.type === 'note').length,
    emails: activities.filter(a => a.type === 'email').length,
    calls: activities.filter(a => a.type === 'call').length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header: filters + action buttons */}
      <div className="px-3 lg:px-5 pt-3 lg:pt-4 pb-3 border-b border-gray-100 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TimelineFilters active={filter} onChange={setFilter} counts={counts} />
          <div className="flex gap-2 shrink-0">
            <button
              onClick={fetchFollowUp}
              disabled={followUpLoading}
              className="flex items-center gap-1.5 text-xs bg-tc-blue/10 hover:bg-tc-blue/20 text-tc-dark border border-tc-blue/30 px-2.5 lg:px-3 py-1.5 rounded-lg transition disabled:opacity-40"
            >
              <Send size={12} /> <span className="hidden sm:inline">{followUpLoading ? 'Generiere…' : 'Follow-Up'}</span>
            </button>
            <button
              onClick={fetchAI}
              disabled={aiLoading || mergedNotes.length === 0}
              className="flex items-center gap-1.5 text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 px-2.5 lg:px-3 py-1.5 rounded-lg transition disabled:opacity-40"
            >
              <Brain size={13} /> <span className="hidden sm:inline">{aiLoading ? 'Analysiere…' : 'KI-Analyse'}</span>
            </button>
          </div>
        </div>

        <NoteInput state={state} />
      </div>

      {/* Timeline feed */}
      <div className="flex-1 overflow-y-auto px-3 lg:px-5 py-4">
        <AISummaryCard state={state} />
        <FollowUpCard lead={lead} state={state} />

        {emailsError && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">{emailsError}</div>
        )}

        {emailsSyncing && !emailsLoaded && (
          <p className="text-sm text-gray-400 text-center py-4">Synchronisiere E-Mails...</p>
        )}

        {filteredActivities.length === 0 && emailsLoaded && (
          <p className="text-sm text-gray-400 text-center py-8">Keine Aktivitäten</p>
        )}

        <div className="mt-3">
          {filteredActivities.map((activity) => (
            <TimelineEntry
              key={`${activity.type}-${activity.id}`}
              activity={activity}
              moveTargets={moveTargets}
              onMoveNote={handleMoveNote}
              onDeleteNote={deleteNote}
              formatDate={formatDate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
