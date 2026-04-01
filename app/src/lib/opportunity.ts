export type OpportunityStage =
  | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSING' | 'WON' | 'LOST'
  | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

// --- Vertrieb ---
export const VERTRIEB_STAGE_ORDER: OpportunityStage[] = [
  'PROPOSAL', 'NEGOTIATION', 'CLOSING', 'WON', 'LOST',
];

// --- Recruiting ---
export const RECRUITING_STAGE_ORDER: OpportunityStage[] = [
  'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED',
];

// Combined order (default)
export const OPP_STAGE_ORDER: OpportunityStage[] = [
  ...VERTRIEB_STAGE_ORDER, ...RECRUITING_STAGE_ORDER,
];

export function getStageOrder(category?: string): OpportunityStage[] {
  if (category === 'RECRUITING') return RECRUITING_STAGE_ORDER;
  if (category === 'VERTRIEB') return VERTRIEB_STAGE_ORDER;
  return OPP_STAGE_ORDER;
}

export const OPP_STAGE_LABELS: Record<OpportunityStage, string> = {
  // Vertrieb
  PROPOSAL:    'Angebot',
  NEGOTIATION: 'Verhandlung',
  CLOSING:     'Abschluss',
  WON:         'Gewonnen',
  LOST:        'Verloren',
  // Recruiting
  SCREENING:   'Screening',
  INTERVIEW:   'Interview',
  OFFER:       'Angebot',
  HIRED:       'Eingestellt',
  REJECTED:    'Abgelehnt',
};

export const OPP_STAGE_COLORS: Record<OpportunityStage, string> = {
  // Vertrieb
  PROPOSAL:    'bg-violet-100 text-violet-700 border-violet-200',
  NEGOTIATION: 'bg-amber-100  text-amber-700  border-amber-200',
  CLOSING:     'bg-green-100  text-green-700  border-green-200',
  WON:         'bg-emerald-100 text-emerald-700 border-emerald-200',
  LOST:        'bg-red-100    text-red-700    border-red-200',
  // Recruiting
  SCREENING:   'bg-sky-100    text-sky-700    border-sky-200',
  INTERVIEW:   'bg-amber-100  text-amber-700  border-amber-200',
  OFFER:       'bg-green-100  text-green-700  border-green-200',
  HIRED:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED:    'bg-red-100    text-red-700    border-red-200',
};

export const ACTIVE_STAGES: OpportunityStage[] = [
  'PROPOSAL', 'NEGOTIATION', 'CLOSING',
  'SCREENING', 'INTERVIEW', 'OFFER',
];

export const TERMINAL_STAGES: OpportunityStage[] = ['WON', 'LOST', 'HIRED', 'REJECTED'];
