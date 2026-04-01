import { Temperature } from './temperature';

export type OppForScore = {
  stage: string;
  hasIdentifiedNeed: boolean;
  isClosingReady: boolean;
  lastActivityAt: Date | string | null;
  expectedCloseDate: Date | string | null;
  aiSentimentScore: number | null;
};

export type OppScoreConfig = {
  daysCold: number;
};

function daysSince(date: Date | string | null): number {
  if (!date) return Infinity;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function clamp(min: number, max: number, val: number): number {
  return Math.max(min, Math.min(max, val));
}

export type OppScoreBreakdown = {
  total: number;
  stage: { points: number; label: string };
  closeDate: { points: number; label: string };
  qualification: { points: number; label: string };
  activityDecay: { points: number; label: string };
  aiSentiment: { points: number; label: string };
};

import { TERMINAL_STAGES, OPP_STAGE_LABELS } from './opportunity';

const isTerminal = (stage: string) => (TERMINAL_STAGES as readonly string[]).includes(stage);

export function calculateOppScore(opp: OppForScore, config: OppScoreConfig): number {
  if (isTerminal(opp.stage)) return 0;
  return calculateOppScoreBreakdown(opp, config).total;
}

export function calculateOppScoreBreakdown(opp: OppForScore, config: OppScoreConfig): OppScoreBreakdown {
  if (isTerminal(opp.stage)) {
    const label = OPP_STAGE_LABELS[opp.stage as keyof typeof OPP_STAGE_LABELS] ?? opp.stage;
    return {
      total: 0,
      stage: { points: 0, label },
      closeDate: { points: 0, label },
      qualification: { points: 0, label },
      activityDecay: { points: 0, label },
      aiSentiment: { points: 0, label },
    };
  }

  // 1. Stage-Fortschritt (0-35)
  let stagePoints = 0;
  if (opp.stage === 'CLOSING' || opp.stage === 'OFFER') stagePoints = 35;
  else if (opp.stage === 'NEGOTIATION' || opp.stage === 'INTERVIEW') stagePoints = 20;
  else stagePoints = 10; // PROPOSAL, SCREENING

  // 2. Close-Date Dringlichkeit (0-25)
  let closeDatePoints = 0;
  let closeDateLabel = 'Kein Close-Date';
  if (opp.expectedCloseDate) {
    const daysUntil = -daysSince(opp.expectedCloseDate); // positive = future
    if (daysUntil < 0) {
      closeDatePoints = 25;
      closeDateLabel = `${Math.abs(daysUntil)} Tage überfällig`;
    } else if (daysUntil <= 7) {
      closeDatePoints = 20;
      closeDateLabel = `In ${daysUntil} Tagen`;
    } else if (daysUntil <= 30) {
      closeDatePoints = 10;
      closeDateLabel = `In ${daysUntil} Tagen`;
    } else {
      closeDatePoints = 0;
      closeDateLabel = `In ${daysUntil} Tagen`;
    }
  }

  // 3. Qualifizierung (0-20)
  let qualPoints = 0;
  const qualParts: string[] = [];
  if (opp.hasIdentifiedNeed) { qualPoints += 10; qualParts.push('Bedarf identifiziert'); }
  if (opp.isClosingReady) { qualPoints += 10; qualParts.push('Abschlussbereit'); }
  const qualLabel = qualParts.length === 0 ? 'Nicht qualifiziert' : qualParts.join(', ');

  // 4. Aktivitäts-Decay (0-20) — je länger keine Aktivität, desto dringender nachfassen
  let activityPoints = 0;
  let activityLabel: string;
  if (!opp.lastActivityAt) {
    activityPoints = 20;
    activityLabel = 'Nie Aktivität';
  } else {
    const days = daysSince(opp.lastActivityAt);
    const ratio = Math.min(days / config.daysCold, 2.0);
    activityPoints = Math.round(ratio * 10);
    activityLabel = `${days} Tage seit Aktivität`;
  }
  activityPoints = Math.min(activityPoints, 20);

  // 5. KI-Sentiment (0-15) — gleiche U-Kurve wie bei Leads
  let aiScore = 0;
  let aiLabel = 'Keine KI-Analyse';
  if (opp.aiSentimentScore != null) {
    const s = opp.aiSentimentScore;
    if (s >= 8) { aiScore = 15; aiLabel = `Score ${s}/10 — kaufbereit`; }
    else if (s >= 6) { aiScore = 5; aiLabel = `Score ${s}/10 — neutral-positiv`; }
    else if (s >= 4) { aiScore = 0; aiLabel = `Score ${s}/10 — neutral`; }
    else { aiScore = 10; aiLabel = `Score ${s}/10 — frustriert`; }
  }

  const total = clamp(0, 100, stagePoints + closeDatePoints + qualPoints + activityPoints + aiScore);

  return {
    total,
    stage: { points: stagePoints, label: OPP_STAGE_LABELS[opp.stage as keyof typeof OPP_STAGE_LABELS] ?? opp.stage },
    closeDate: { points: closeDatePoints, label: closeDateLabel },
    qualification: { points: qualPoints, label: qualLabel },
    activityDecay: { points: activityPoints, label: activityLabel },
    aiSentiment: { points: aiScore, label: aiLabel },
  };
}

export function oppScoreToTemperature(score: number): Temperature {
  if (score >= 60) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}
