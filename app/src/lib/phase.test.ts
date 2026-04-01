import { computeLeadPhase, type LeadForPhase } from './phase';

function makeLead(overrides: Partial<LeadForPhase> = {}): LeadForPhase {
  return {
    archived: false,
    lastContactedAt: null,
    opportunities: [],
    _noteCount: 0,
    ...overrides,
  };
}

describe('computeLeadPhase', () => {
  it('returns ARCHIVIERT for archived lead', () => {
    expect(computeLeadPhase(makeLead({ archived: true }))).toBe('ARCHIVIERT');
  });

  it('returns NEU for new lead without contact or notes', () => {
    expect(computeLeadPhase(makeLead())).toBe('NEU');
  });

  it('returns IN_BEARBEITUNG when contacted but no opps', () => {
    expect(computeLeadPhase(makeLead({ lastContactedAt: new Date() }))).toBe('IN_BEARBEITUNG');
  });

  it('returns IN_BEARBEITUNG when has notes but no contact', () => {
    expect(computeLeadPhase(makeLead({ _noteCount: 3 }))).toBe('IN_BEARBEITUNG');
  });

  it('returns opp stage for single active opp', () => {
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'PROPOSAL' }],
    }))).toBe('PROPOSAL');
  });

  it('returns furthest active stage across multiple opps', () => {
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'PROPOSAL' }, { stage: 'CLOSING' }],
    }))).toBe('CLOSING');
  });

  it('returns furthest across Vertrieb + Recruiting', () => {
    // ACTIVE_STAGE_ORDER: PROPOSAL(0), NEGOTIATION(1), CLOSING(2), SCREENING(3), INTERVIEW(4), OFFER(5)
    // SCREENING(3) > NEGOTIATION(1) → SCREENING wins
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'SCREENING' }, { stage: 'NEGOTIATION' }],
    }))).toBe('SCREENING');
  });

  it('returns GEWONNEN when all opps are WON', () => {
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'WON' }],
    }))).toBe('GEWONNEN');
  });

  it('returns GEWONNEN for HIRED', () => {
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'HIRED' }],
    }))).toBe('GEWONNEN');
  });

  it('returns VERLOREN when all opps are LOST', () => {
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'LOST' }],
    }))).toBe('VERLOREN');
  });

  it('returns VERLOREN for REJECTED', () => {
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'REJECTED' }],
    }))).toBe('VERLOREN');
  });

  it('prefers active opp over terminal', () => {
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'WON' }, { stage: 'PROPOSAL' }],
    }))).toBe('PROPOSAL');
  });

  it('returns GEWONNEN when mixed WON + LOST (WON wins)', () => {
    expect(computeLeadPhase(makeLead({
      opportunities: [{ stage: 'WON' }, { stage: 'LOST' }],
    }))).toBe('GEWONNEN');
  });
});
