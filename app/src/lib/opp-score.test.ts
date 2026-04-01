import { calculateOppScore, calculateOppScoreBreakdown, oppScoreToTemperature, type OppForScore, type OppScoreConfig } from './opp-score';

const config: OppScoreConfig = { daysCold: 30 };

function makeOpp(overrides: Partial<OppForScore> = {}): OppForScore {
  return {
    stage: 'PROPOSAL',
    hasIdentifiedNeed: false,
    isClosingReady: false,
    lastActivityAt: null,
    expectedCloseDate: null,
    aiSentimentScore: null,
    ...overrides,
  };
}

describe('calculateOppScore', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01')); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns 0 for terminal stages', () => {
    expect(calculateOppScore(makeOpp({ stage: 'WON' }), config)).toBe(0);
    expect(calculateOppScore(makeOpp({ stage: 'LOST' }), config)).toBe(0);
    expect(calculateOppScore(makeOpp({ stage: 'HIRED' }), config)).toBe(0);
    expect(calculateOppScore(makeOpp({ stage: 'REJECTED' }), config)).toBe(0);
  });

  it('scores active opp > 0', () => {
    expect(calculateOppScore(makeOpp(), config)).toBeGreaterThan(0);
  });

  it('CLOSING scores higher than PROPOSAL', () => {
    const closing = calculateOppScore(makeOpp({ stage: 'CLOSING' }), config);
    const proposal = calculateOppScore(makeOpp({ stage: 'PROPOSAL' }), config);
    expect(closing).toBeGreaterThan(proposal);
  });
});

describe('calculateOppScoreBreakdown', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01')); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns all-zero breakdown for terminal stage', () => {
    const bd = calculateOppScoreBreakdown(makeOpp({ stage: 'WON' }), config);
    expect(bd.total).toBe(0);
    expect(bd.stage.points).toBe(0);
  });

  describe('stage points', () => {
    it.each([
      ['CLOSING', 35], ['OFFER', 35],
      ['NEGOTIATION', 20], ['INTERVIEW', 20],
      ['PROPOSAL', 10], ['SCREENING', 10],
    ])('%s → %i points', (stage, points) => {
      const bd = calculateOppScoreBreakdown(makeOpp({ stage }), config);
      expect(bd.stage.points).toBe(points);
    });
  });

  describe('close date urgency', () => {
    it('overdue → 25 points', () => {
      const bd = calculateOppScoreBreakdown(makeOpp({ expectedCloseDate: new Date('2025-05-26') }), config);
      expect(bd.closeDate.points).toBe(25);
    });

    it('within 7 days → 20 points', () => {
      const bd = calculateOppScoreBreakdown(makeOpp({ expectedCloseDate: new Date('2025-06-04') }), config);
      expect(bd.closeDate.points).toBe(20);
    });

    it('within 30 days → 10 points', () => {
      const bd = calculateOppScoreBreakdown(makeOpp({ expectedCloseDate: new Date('2025-06-20') }), config);
      expect(bd.closeDate.points).toBe(10);
    });

    it('beyond 30 days → 0 points', () => {
      const bd = calculateOppScoreBreakdown(makeOpp({ expectedCloseDate: new Date('2025-08-01') }), config);
      expect(bd.closeDate.points).toBe(0);
    });

    it('no close date → 0 points', () => {
      const bd = calculateOppScoreBreakdown(makeOpp(), config);
      expect(bd.closeDate.points).toBe(0);
    });
  });

  describe('qualification', () => {
    it('neither → 0', () => {
      expect(calculateOppScoreBreakdown(makeOpp(), config).qualification.points).toBe(0);
    });

    it('need only → 10', () => {
      expect(calculateOppScoreBreakdown(makeOpp({ hasIdentifiedNeed: true }), config).qualification.points).toBe(10);
    });

    it('closing ready only → 10', () => {
      expect(calculateOppScoreBreakdown(makeOpp({ isClosingReady: true }), config).qualification.points).toBe(10);
    });

    it('both → 20', () => {
      expect(calculateOppScoreBreakdown(makeOpp({ hasIdentifiedNeed: true, isClosingReady: true }), config).qualification.points).toBe(20);
    });
  });

  describe('activity decay', () => {
    it('no activity ever → 20 points', () => {
      expect(calculateOppScoreBreakdown(makeOpp(), config).activityDecay.points).toBe(20);
    });

    it('recent activity → low points', () => {
      const bd = calculateOppScoreBreakdown(makeOpp({ lastActivityAt: new Date('2025-05-30') }), config);
      expect(bd.activityDecay.points).toBeLessThan(5);
    });

    it('old activity → higher points', () => {
      const bd = calculateOppScoreBreakdown(makeOpp({ lastActivityAt: new Date('2025-04-01') }), config);
      expect(bd.activityDecay.points).toBeGreaterThan(15);
    });
  });

  describe('AI sentiment', () => {
    it('no score → 0', () => {
      expect(calculateOppScoreBreakdown(makeOpp(), config).aiSentiment.points).toBe(0);
    });

    it('high (>=8) → 15', () => {
      expect(calculateOppScoreBreakdown(makeOpp({ aiSentimentScore: 9 }), config).aiSentiment.points).toBe(15);
    });

    it('neutral-positive (6-7) → 5', () => {
      expect(calculateOppScoreBreakdown(makeOpp({ aiSentimentScore: 7 }), config).aiSentiment.points).toBe(5);
    });

    it('neutral (4-5) → 0', () => {
      expect(calculateOppScoreBreakdown(makeOpp({ aiSentimentScore: 5 }), config).aiSentiment.points).toBe(0);
    });

    it('frustrated (<4) → 10', () => {
      expect(calculateOppScoreBreakdown(makeOpp({ aiSentimentScore: 2 }), config).aiSentiment.points).toBe(10);
    });
  });

  it('total is clamped to 0-100', () => {
    // Max scenario: CLOSING(35) + overdue(25) + both qual(20) + no activity(20) + high sentiment(15) = 115 → 100
    const bd = calculateOppScoreBreakdown(makeOpp({
      stage: 'CLOSING',
      expectedCloseDate: new Date('2025-05-01'),
      hasIdentifiedNeed: true,
      isClosingReady: true,
      aiSentimentScore: 10,
    }), config);
    expect(bd.total).toBeLessThanOrEqual(100);
  });
});

describe('oppScoreToTemperature', () => {
  it('hot for score >= 60', () => {
    expect(oppScoreToTemperature(60)).toBe('hot');
    expect(oppScoreToTemperature(100)).toBe('hot');
  });

  it('warm for score 30-59', () => {
    expect(oppScoreToTemperature(30)).toBe('warm');
    expect(oppScoreToTemperature(59)).toBe('warm');
  });

  it('cold for score < 30', () => {
    expect(oppScoreToTemperature(29)).toBe('cold');
    expect(oppScoreToTemperature(0)).toBe('cold');
  });
});
