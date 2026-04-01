import type { OpportunityStage } from './opportunity';
import { OPP_STAGE_LABELS, OPP_STAGE_COLORS, VERTRIEB_STAGE_ORDER, RECRUITING_STAGE_ORDER } from './opportunity';

// Base phases (no active opp) + dynamic opp stages
export type LeadPhase = 'NEU' | 'IN_BEARBEITUNG' | 'GEWONNEN' | 'VERLOREN' | 'ARCHIVIERT' | OpportunityStage;

export type LeadForPhase = {
  archived: boolean;
  lastContactedAt: Date | string | null;
  opportunities: { stage: string }[];
  _noteCount?: number;
};

// Active stages in progression order (furthest = highest index)
const ACTIVE_STAGE_ORDER: OpportunityStage[] = [
  // Vertrieb
  'PROPOSAL', 'NEGOTIATION', 'CLOSING',
  // Recruiting
  'SCREENING', 'INTERVIEW', 'OFFER',
];

const TERMINAL_WON = ['WON', 'HIRED'];
const TERMINAL_LOST = ['LOST', 'REJECTED'];
const TERMINAL_ALL = [...TERMINAL_WON, ...TERMINAL_LOST];

export function computeLeadPhase(lead: LeadForPhase): LeadPhase {
  if (lead.archived) return 'ARCHIVIERT';

  const opps = lead.opportunities;
  if (opps.length === 0) {
    if (!lead.lastContactedAt && (lead._noteCount ?? 0) === 0) return 'NEU';
    return 'IN_BEARBEITUNG';
  }

  // Find the furthest active (non-terminal) opp stage
  const activeOpps = opps.filter(o => !TERMINAL_ALL.includes(o.stage));
  if (activeOpps.length > 0) {
    let furthestIndex = -1;
    let furthestStage: OpportunityStage = 'PROPOSAL';
    for (const opp of activeOpps) {
      const idx = ACTIVE_STAGE_ORDER.indexOf(opp.stage as OpportunityStage);
      if (idx > furthestIndex) {
        furthestIndex = idx;
        furthestStage = opp.stage as OpportunityStage;
      }
    }
    return furthestStage;
  }

  // All opps are terminal
  const hasWon = opps.some(o => TERMINAL_WON.includes(o.stage));
  if (hasWon) return 'GEWONNEN';

  return 'VERLOREN';
}

// Labels: base phases + opp stage labels
export const PHASE_LABELS: Record<LeadPhase, string> = {
  NEU: 'Neu',
  IN_BEARBEITUNG: 'In Bearbeitung',
  GEWONNEN: 'Gewonnen',
  VERLOREN: 'Verloren',
  ARCHIVIERT: 'Archiviert',
  ...OPP_STAGE_LABELS,
};

export const PHASE_COLORS: Record<LeadPhase, string> = {
  NEU: 'bg-tc-blue/15 text-tc-dark',
  IN_BEARBEITUNG: 'bg-tc-blue/25 text-tc-dark',
  GEWONNEN: 'bg-green-100 text-green-700',
  VERLOREN: 'bg-gray-100 text-gray-500',
  ARCHIVIERT: 'bg-gray-100 text-gray-400',
  // Opp stage colors (strip border class for badge usage)
  PROPOSAL:    'bg-violet-100 text-violet-700',
  NEGOTIATION: 'bg-amber-100 text-amber-700',
  CLOSING:     'bg-green-100 text-green-700',
  WON:         'bg-emerald-100 text-emerald-700',
  LOST:        'bg-red-100 text-red-700',
  SCREENING:   'bg-sky-100 text-sky-700',
  INTERVIEW:   'bg-amber-100 text-amber-700',
  OFFER:       'bg-green-100 text-green-700',
  HIRED:       'bg-emerald-100 text-emerald-700',
  REJECTED:    'bg-red-100 text-red-700',
};

// Filter options: base phases + active opp stages
export const PHASE_OPTIONS: LeadPhase[] = [
  'NEU',
  'IN_BEARBEITUNG',
  ...ACTIVE_STAGE_ORDER,
  'GEWONNEN',
  'VERLOREN',
  'ARCHIVIERT',
];
