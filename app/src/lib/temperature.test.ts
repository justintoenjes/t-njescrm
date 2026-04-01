import { calculateOpportunityTemperature, explainOpportunityTemperature, type OpportunityForTemp, type TempConfig } from './temperature';

const config: TempConfig = { daysWarm: 14, daysCold: 30 };

function makeOpp(overrides: Partial<OpportunityForTemp> = {}): OpportunityForTemp {
  return {
    stage: 'PROPOSAL',
    hasIdentifiedNeed: false,
    isClosingReady: false,
    lastActivityAt: null,
    ...overrides,
  };
}

describe('calculateOpportunityTemperature', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01')); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns cold for WON stage', () => {
    expect(calculateOpportunityTemperature(makeOpp({ stage: 'WON' }), config)).toBe('cold');
  });

  it('returns cold for LOST stage', () => {
    expect(calculateOpportunityTemperature(makeOpp({ stage: 'LOST' }), config)).toBe('cold');
  });

  it('returns hot for CLOSING stage', () => {
    expect(calculateOpportunityTemperature(makeOpp({ stage: 'CLOSING' }), config)).toBe('hot');
  });

  it('returns hot when isClosingReady', () => {
    expect(calculateOpportunityTemperature(makeOpp({ isClosingReady: true }), config)).toBe('hot');
  });

  it('returns warm when hasIdentifiedNeed', () => {
    expect(calculateOpportunityTemperature(makeOpp({ hasIdentifiedNeed: true }), config)).toBe('warm');
  });

  it('returns warm for recent activity (within daysCold)', () => {
    const fiveDaysAgo = new Date('2025-05-27');
    expect(calculateOpportunityTemperature(makeOpp({ lastActivityAt: fiveDaysAgo }), config)).toBe('warm');
  });

  it('returns cold for old activity (beyond daysCold)', () => {
    const fortyFiveDaysAgo = new Date('2025-04-17');
    expect(calculateOpportunityTemperature(makeOpp({ lastActivityAt: fortyFiveDaysAgo }), config)).toBe('cold');
  });

  it('returns cold when no activity ever', () => {
    expect(calculateOpportunityTemperature(makeOpp({ lastActivityAt: null }), config)).toBe('cold');
  });
});

describe('explainOpportunityTemperature', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01')); });
  afterEach(() => { vi.useRealTimers(); });

  it('explains WON/LOST as abgeschlossen', () => {
    expect(explainOpportunityTemperature(makeOpp({ stage: 'WON' }), config)).toBe('Abgeschlossene Opportunity');
    expect(explainOpportunityTemperature(makeOpp({ stage: 'LOST' }), config)).toBe('Abgeschlossene Opportunity');
  });

  it('explains CLOSING as abschlussbereit', () => {
    expect(explainOpportunityTemperature(makeOpp({ stage: 'CLOSING' }), config)).toBe('Abschlussbereit / Closing-Phase');
  });

  it('explains identified need', () => {
    expect(explainOpportunityTemperature(makeOpp({ hasIdentifiedNeed: true }), config)).toBe('Identifizierter Bedarf');
  });

  it('explains recent activity with day count', () => {
    const fiveDaysAgo = new Date('2025-05-27');
    const result = explainOpportunityTemperature(makeOpp({ lastActivityAt: fiveDaysAgo }), config);
    expect(result).toContain('5 Tagen');
    expect(result).toContain('≤ 30d');
  });

  it('explains no activity with infinity', () => {
    const result = explainOpportunityTemperature(makeOpp({ lastActivityAt: null }), config);
    expect(result).toContain('∞');
  });
});
