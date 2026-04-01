export type Temperature = 'hot' | 'warm' | 'cold';

export type OpportunityForTemp = {
  stage: string;
  hasIdentifiedNeed: boolean;
  isClosingReady: boolean;
  lastActivityAt: Date | string | null;
};

export type TempConfig = {
  daysWarm: number;
  daysCold: number;
};

function daysSince(date: Date | string | null): number {
  if (!date) return Infinity;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

export function calculateOpportunityTemperature(opp: OpportunityForTemp, config: TempConfig): Temperature {
  const { daysWarm, daysCold } = config;
  if (opp.stage === 'WON' || opp.stage === 'LOST') return 'cold';
  if (opp.isClosingReady || opp.stage === 'CLOSING') return 'hot';
  if (opp.hasIdentifiedNeed) return 'warm';
  const days = daysSince(opp.lastActivityAt);
  if (days <= daysCold) return 'warm';
  return 'cold';
}

export function explainOpportunityTemperature(opp: OpportunityForTemp, config: TempConfig): string {
  if (opp.stage === 'WON' || opp.stage === 'LOST') return 'Abgeschlossene Opportunity';
  if (opp.isClosingReady || opp.stage === 'CLOSING') return 'Abschlussbereit / Closing-Phase';
  if (opp.hasIdentifiedNeed) return 'Identifizierter Bedarf';
  const days = daysSince(opp.lastActivityAt);
  if (days <= config.daysCold) return `Letzte Aktivität vor ${days} Tagen (≤ ${config.daysCold}d)`;
  return `Keine Aktivität seit ${days === Infinity ? '∞' : days} Tagen (> ${config.daysCold}d)`;
}

export const TEMP_LABELS: Record<Temperature, string> = {
  hot: '🔥 Hot',
  warm: '🌤️ Warm',
  cold: '❄️ Cold',
};

export const TEMP_COLORS: Record<Temperature, string> = {
  hot: 'bg-red-100 text-red-700 border-red-200',
  warm: 'bg-orange-100 text-orange-700 border-orange-200',
  cold: 'bg-blue-100 text-blue-700 border-blue-200',
};
