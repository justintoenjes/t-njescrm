import { Temperature } from './temperature';
import { LeadPhase, computeLeadPhase, LeadForPhase, PHASE_LABELS } from './phase';
import { TERMINAL_STAGES, ACTIVE_STAGES } from './opportunity';

export type LeadForScore = {
  archived: boolean;
  lastContactedAt: Date | string | null;
  missedCallsCount: number;
  noShowCount: number;
  aiSentimentScore: number | null;
};

export type OpportunityForScore = {
  stage: string;
  hasIdentifiedNeed: boolean;
  isClosingReady: boolean;
  value: number | null;
  expectedCloseDate: Date | string | null;
};

export type ScoreConfig = {
  daysWarm: number;
  daysCold: number;
};

function daysSince(date: Date | string | null): number {
  if (!date) return Infinity;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function clamp(min: number, max: number, val: number): number {
  return Math.max(min, Math.min(max, val));
}

export function calculateLeadScore(
  lead: LeadForScore,
  activeOpportunities: OpportunityForScore[],
  phase: LeadPhase,
  config: ScoreConfig,
): number {
  if (lead.archived) return 0;

  const { daysCold } = config;

  // 1. Contact Recency (0-30) — fresh contact = high score, decays over time
  let contactRecency: number;
  if (!lead.lastContactedAt) {
    contactRecency = 5; // Never contacted but exists = small baseline
  } else {
    const days = daysSince(lead.lastContactedAt);
    contactRecency = Math.round(30 * Math.max(0, 1 - days / (daysCold * 1.5)));
  }

  // 2. Opportunity Score (0-30)
  let oppScore = 0;
  for (const opp of activeOpportunities) {
    // Vertrieb stages
    if (opp.isClosingReady || opp.stage === 'CLOSING') {
      oppScore += 20;
    } else if (opp.stage === 'NEGOTIATION') {
      oppScore += 15;
    } else if (opp.stage === 'OFFER') {
      oppScore += 20;
    } else if (opp.stage === 'INTERVIEW') {
      oppScore += 15;
    } else if (opp.hasIdentifiedNeed) {
      oppScore += 12;
    } else {
      // PROPOSAL or SCREENING
      oppScore += 10;
    }

    // Close date urgency
    if (opp.expectedCloseDate) {
      const daysUntilClose = -daysSince(opp.expectedCloseDate);
      if (daysUntilClose <= 7 && daysUntilClose >= 0) {
        oppScore += 10;
      } else if (daysUntilClose < 0) {
        oppScore += 10; // Overdue = urgent
      }
    }
  }
  oppScore = Math.min(oppScore, 30);

  // 3. AI Sentiment (0-15) — U-shaped: high interest & frustration both urgent
  let aiScore = 0;
  if (lead.aiSentimentScore != null) {
    const s = lead.aiSentimentScore;
    if (s >= 8) aiScore = 15;       // kaufbereit/interessiert
    else if (s >= 6) aiScore = 5;   // neutral-positive
    else if (s >= 4) aiScore = 0;   // neutral
    else aiScore = 10;              // frustriert/skeptisch
  }

  // 4. Engagement malus (0 to -10)
  const missedPenalty = Math.min(Math.floor(lead.missedCallsCount / 2) * 2, 6);
  const noShowPenalty = Math.min(lead.noShowCount * 3, 6);
  const engagementMalus = Math.min(missedPenalty + noShowPenalty, 10);

  // 5. Phase bonus (0-15)
  let phaseBonus = 0;
  if (phase === 'NEU') phaseBonus = 15;
  else if (phase === 'IN_BEARBEITUNG') phaseBonus = 10;
  else if (ACTIVE_STAGES.includes(phase as any)) phaseBonus = 8;

  return clamp(0, 100, contactRecency + oppScore + aiScore - engagementMalus + phaseBonus);
}

export type ScoreBreakdown = {
  total: number;
  contactRecency: { points: number; label: string };
  opportunity: { points: number; label: string };
  aiSentiment: { points: number; label: string };
  engagement: { points: number; label: string };
  phaseBonus: { points: number; label: string };
};

export function calculateLeadScoreBreakdown(
  lead: LeadForScore,
  activeOpportunities: OpportunityForScore[],
  phase: LeadPhase,
  config: ScoreConfig,
): ScoreBreakdown {
  if (lead.archived) {
    return {
      total: 0,
      contactRecency: { points: 0, label: 'Archiviert' },
      opportunity: { points: 0, label: 'Archiviert' },
      aiSentiment: { points: 0, label: 'Archiviert' },
      engagement: { points: 0, label: 'Archiviert' },
      phaseBonus: { points: 0, label: 'Archiviert' },
    };
  }

  const { daysCold } = config;

  // 1. Contact Recency
  let contactRecency: number;
  let contactLabel: string;
  if (!lead.lastContactedAt) {
    contactRecency = 5;
    contactLabel = 'Noch kein Kontakt';
  } else {
    const days = daysSince(lead.lastContactedAt);
    contactRecency = Math.round(30 * Math.max(0, 1 - days / (daysCold * 1.5)));
    contactLabel = days === 0 ? 'Heute kontaktiert' : `${days} Tage seit Kontakt`;
  }

  // 2. Opportunity Score
  let oppScore = 0;
  const oppLabels: string[] = [];
  for (const opp of activeOpportunities) {
    if (opp.isClosingReady || opp.stage === 'CLOSING') {
      oppScore += 20;
    } else if (opp.stage === 'NEGOTIATION') {
      oppScore += 15;
    } else if (opp.stage === 'OFFER') {
      oppScore += 20;
    } else if (opp.stage === 'INTERVIEW') {
      oppScore += 15;
    } else if (opp.hasIdentifiedNeed) {
      oppScore += 12;
    } else {
      oppScore += 10;
    }
    if (opp.expectedCloseDate) {
      const daysUntilClose = -daysSince(opp.expectedCloseDate);
      if (daysUntilClose <= 7 && daysUntilClose >= 0) {
        oppScore += 10;
        oppLabels.push('Close-Date ≤7d');
      } else if (daysUntilClose < 0) {
        oppScore += 10;
        oppLabels.push('Close-Date überfällig');
      }
    }
  }
  oppScore = Math.min(oppScore, 30);
  const oppLabel = activeOpportunities.length === 0
    ? 'Keine aktiven Opps'
    : `${activeOpportunities.length} aktive Opp(s)${oppLabels.length ? ' · ' + oppLabels.join(', ') : ''}`;

  // 3. AI Sentiment
  let aiScore = 0;
  let aiLabel = 'Keine KI-Analyse';
  if (lead.aiSentimentScore != null) {
    const s = lead.aiSentimentScore;
    if (s >= 8) { aiScore = 15; aiLabel = `Score ${s}/10 — kaufbereit`; }
    else if (s >= 6) { aiScore = 5; aiLabel = `Score ${s}/10 — neutral-positiv`; }
    else if (s >= 4) { aiScore = 0; aiLabel = `Score ${s}/10 — neutral`; }
    else { aiScore = 10; aiLabel = `Score ${s}/10 — frustriert`; }
  }

  // 4. Engagement malus
  const missedPenalty = Math.min(Math.floor(lead.missedCallsCount / 2) * 2, 6);
  const noShowPenalty = Math.min(lead.noShowCount * 3, 6);
  const engagementMalus = Math.min(missedPenalty + noShowPenalty, 10);
  const engParts: string[] = [];
  if (lead.missedCallsCount > 0) engParts.push(`${lead.missedCallsCount} verpasste Anrufe`);
  if (lead.noShowCount > 0) engParts.push(`${lead.noShowCount} No-Shows`);
  const engLabel = engParts.length === 0 ? 'Keine Ausfälle' : engParts.join(', ');

  // 5. Phase bonus
  let phaseBonus = 0;
  if (phase === 'NEU') phaseBonus = 15;
  else if (phase === 'IN_BEARBEITUNG') phaseBonus = 10;
  else if (ACTIVE_STAGES.includes(phase as any)) phaseBonus = 8;

  const PHASE_NAMES = PHASE_LABELS;

  const total = clamp(0, 100, contactRecency + oppScore + aiScore - engagementMalus + phaseBonus);

  return {
    total,
    contactRecency: { points: contactRecency, label: contactLabel },
    opportunity: { points: oppScore, label: oppLabel },
    aiSentiment: { points: aiScore, label: aiLabel },
    engagement: { points: -engagementMalus, label: engLabel },
    phaseBonus: { points: phaseBonus, label: PHASE_NAMES[phase] ?? phase },
  };
}

export function scoreToTemperature(score: number): Temperature {
  if (score >= 50) return 'hot';
  if (score >= 25) return 'warm';
  return 'cold';
}
