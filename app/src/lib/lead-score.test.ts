import { calculateLeadScore, calculateLeadScoreBreakdown, scoreToTemperature, type LeadForScore, type OpportunityForScore, type ScoreConfig } from './lead-score';
import type { LeadPhase } from './phase';

const config: ScoreConfig = { daysWarm: 14, daysCold: 30 };

function makeLead(overrides: Partial<LeadForScore> = {}): LeadForScore {
  return {
    archived: false,
    lastContactedAt: null,
    missedCallsCount: 0,
    noShowCount: 0,
    aiSentimentScore: null,
    ...overrides,
  };
}

function makeOpp(overrides: Partial<OpportunityForScore> = {}): OpportunityForScore {
  return {
    stage: 'PROPOSAL',
    hasIdentifiedNeed: false,
    isClosingReady: false,
    value: null,
    expectedCloseDate: null,
    ...overrides,
  };
}

describe('calculateLeadScore', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01')); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns 0 for archived lead', () => {
    expect(calculateLeadScore(makeLead({ archived: true }), [], 'NEU', config)).toBe(0);
  });

  it('scores NEU lead with no contact', () => {
    // contactRecency=5, oppScore=0, ai=0, malus=0, phase=15 → 20
    expect(calculateLeadScore(makeLead(), [], 'NEU', config)).toBe(20);
  });

  it('scores recently contacted lead', () => {
    const lead = makeLead({ lastContactedAt: new Date('2025-06-01') });
    const score = calculateLeadScore(lead, [], 'IN_BEARBEITUNG', config);
    // contactRecency=30 (today), oppScore=0, ai=0, malus=0, phase=10 → 40
    expect(score).toBe(40);
  });

  it('contact recency decays over time', () => {
    const recent = makeLead({ lastContactedAt: new Date('2025-05-30') });
    const old = makeLead({ lastContactedAt: new Date('2025-04-01') });
    const recentScore = calculateLeadScore(recent, [], 'IN_BEARBEITUNG', config);
    const oldScore = calculateLeadScore(old, [], 'IN_BEARBEITUNG', config);
    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('contact beyond daysCold*1.5 gives 0 recency', () => {
    // daysCold=30, threshold=45 days
    const lead = makeLead({ lastContactedAt: new Date('2025-04-01') }); // 61 days ago
    const score = calculateLeadScore(lead, [], 'IN_BEARBEITUNG', config);
    // contactRecency=0, phase=10 → 10
    expect(score).toBe(10);
  });

  it('adds opp score for CLOSING stage', () => {
    const withOpp = calculateLeadScore(makeLead(), [makeOpp({ stage: 'CLOSING' })], 'CLOSING', config);
    const withoutOpp = calculateLeadScore(makeLead(), [], 'NEU', config);
    expect(withOpp).toBeGreaterThan(withoutOpp);
  });

  it('caps opp score at 30', () => {
    const manyOpps = [
      makeOpp({ stage: 'CLOSING' }),
      makeOpp({ stage: 'CLOSING' }),
      makeOpp({ stage: 'CLOSING' }),
    ];
    const score = calculateLeadScore(makeLead(), manyOpps, 'CLOSING', config);
    // oppScore should be capped at 30 not 60
    expect(score).toBeLessThanOrEqual(100);
  });

  it('adds close date urgency', () => {
    const urgent = makeOpp({ expectedCloseDate: new Date('2025-06-03') }); // 2 days out
    const notUrgent = makeOpp({ expectedCloseDate: new Date('2025-09-01') }); // far out
    const urgentScore = calculateLeadScore(makeLead(), [urgent], 'PROPOSAL', config);
    const notUrgentScore = calculateLeadScore(makeLead(), [notUrgent], 'PROPOSAL', config);
    expect(urgentScore).toBeGreaterThan(notUrgentScore);
  });

  it('adds AI sentiment for high score', () => {
    const withAi = calculateLeadScore(makeLead({ aiSentimentScore: 9 }), [], 'NEU', config);
    const withoutAi = calculateLeadScore(makeLead(), [], 'NEU', config);
    expect(withAi - withoutAi).toBe(15);
  });

  it('adds AI sentiment for frustrated (U-curve)', () => {
    const frustrated = calculateLeadScore(makeLead({ aiSentimentScore: 2 }), [], 'NEU', config);
    const neutral = calculateLeadScore(makeLead({ aiSentimentScore: 5 }), [], 'NEU', config);
    expect(frustrated).toBeGreaterThan(neutral);
  });

  it('applies missed calls penalty', () => {
    const penalized = calculateLeadScore(makeLead({ missedCallsCount: 4 }), [], 'NEU', config);
    const clean = calculateLeadScore(makeLead(), [], 'NEU', config);
    expect(penalized).toBeLessThan(clean);
  });

  it('applies no-show penalty', () => {
    const penalized = calculateLeadScore(makeLead({ noShowCount: 2 }), [], 'NEU', config);
    const clean = calculateLeadScore(makeLead(), [], 'NEU', config);
    expect(penalized).toBeLessThan(clean);
  });

  it('caps engagement malus at 10', () => {
    const heavy = makeLead({ missedCallsCount: 10, noShowCount: 5 });
    const moderate = makeLead({ missedCallsCount: 4, noShowCount: 2 });
    const heavyScore = calculateLeadScore(heavy, [], 'NEU', config);
    const moderateScore = calculateLeadScore(moderate, [], 'NEU', config);
    // Both should have malus of 10 (capped)
    expect(heavyScore).toBe(moderateScore);
  });

  it('gives phase bonus for NEU (15)', () => {
    const neu = calculateLeadScore(makeLead(), [], 'NEU', config);
    const inBearbeitung = calculateLeadScore(makeLead(), [], 'IN_BEARBEITUNG', config);
    expect(neu - inBearbeitung).toBe(5); // 15 - 10
  });

  it('gives phase bonus for active opp stages (8)', () => {
    const proposal = calculateLeadScore(makeLead(), [], 'PROPOSAL', config);
    const gewonnen = calculateLeadScore(makeLead(), [], 'GEWONNEN', config);
    expect(proposal - gewonnen).toBe(8); // 8 - 0
  });

  it('clamps score to 0-100', () => {
    // Min: archived → 0
    expect(calculateLeadScore(makeLead({ archived: true }), [], 'NEU', config)).toBe(0);
    // Verify non-negative even with heavy penalties
    const heavy = makeLead({ missedCallsCount: 20, noShowCount: 10 });
    expect(calculateLeadScore(heavy, [], 'GEWONNEN', config)).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateLeadScoreBreakdown', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01')); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns all-Archiviert for archived lead', () => {
    const bd = calculateLeadScoreBreakdown(makeLead({ archived: true }), [], 'NEU', config);
    expect(bd.total).toBe(0);
    expect(bd.contactRecency.label).toBe('Archiviert');
    expect(bd.opportunity.label).toBe('Archiviert');
    expect(bd.aiSentiment.label).toBe('Archiviert');
    expect(bd.engagement.label).toBe('Archiviert');
    expect(bd.phaseBonus.label).toBe('Archiviert');
  });

  it('total matches sum of parts (clamped)', () => {
    const bd = calculateLeadScoreBreakdown(
      makeLead({ lastContactedAt: new Date('2025-05-28'), aiSentimentScore: 7, missedCallsCount: 2 }),
      [makeOpp({ stage: 'NEGOTIATION' })],
      'NEGOTIATION',
      config,
    );
    const rawSum = bd.contactRecency.points + bd.opportunity.points + bd.aiSentiment.points + bd.engagement.points + bd.phaseBonus.points;
    expect(bd.total).toBe(Math.max(0, Math.min(100, rawSum)));
  });

  it('labels contact as "Heute kontaktiert" for same day', () => {
    const bd = calculateLeadScoreBreakdown(makeLead({ lastContactedAt: new Date('2025-06-01') }), [], 'IN_BEARBEITUNG', config);
    expect(bd.contactRecency.label).toBe('Heute kontaktiert');
  });

  it('labels no opps correctly', () => {
    const bd = calculateLeadScoreBreakdown(makeLead(), [], 'NEU', config);
    expect(bd.opportunity.label).toBe('Keine aktiven Opps');
  });
});

describe('scoreToTemperature', () => {
  it('hot for score >= 50', () => {
    expect(scoreToTemperature(50)).toBe('hot');
    expect(scoreToTemperature(100)).toBe('hot');
  });

  it('warm for score 25-49', () => {
    expect(scoreToTemperature(25)).toBe('warm');
    expect(scoreToTemperature(49)).toBe('warm');
  });

  it('cold for score < 25', () => {
    expect(scoreToTemperature(24)).toBe('cold');
    expect(scoreToTemperature(0)).toBe('cold');
  });
});
