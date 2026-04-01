import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeLeadPhase } from '@/lib/phase';
import { calculateLeadScore, scoreToTemperature } from '@/lib/lead-score';
import { ACTIVE_STAGES } from '@/lib/opportunity';

// Stage progression index for "best phase" comparison
const STAGE_INDEX: Record<string, number> = {
  NEU: 0, IN_BEARBEITUNG: 1,
  PROPOSAL: 2, SCREENING: 2,
  NEGOTIATION: 3, INTERVIEW: 3,
  CLOSING: 4, OFFER: 4,
};

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';

  const [companies, configs] = await Promise.all([
    prisma.company.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
      include: {
        _count: { select: { leads: true } },
        leads: {
          include: {
            opportunities: {
              select: { id: true, stage: true, hasIdentifiedNeed: true, isClosingReady: true, lastActivityAt: true, value: true, expectedCloseDate: true, aiSentimentScore: true },
            },
            _count: { select: { notes: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.globalConfig.findMany({ where: { key: { in: ['days_warm', 'days_cold'] } } }),
  ]);

  const daysWarm = parseInt(configs.find(c => c.key === 'days_warm')?.value ?? '14');
  const daysCold = parseInt(configs.find(c => c.key === 'days_cold')?.value ?? '30');
  const scoreConfig = { daysWarm, daysCold };

  const result = companies.map(({ leads, _count: companyCounts, ...c }) => {
    const activeOpps = leads.flatMap(l => l.opportunities.filter(o => o.stage !== 'WON' && o.stage !== 'LOST' && o.stage !== 'HIRED' && o.stage !== 'REJECTED'));
    const tempDist = { hot: 0, warm: 0, cold: 0 };
    let bestPhase: string | null = null;
    let bestPhaseIndex = -1;

    for (const lead of leads) {
      const { _count: leadCounts, ...leadData } = lead;
      const leadActiveOpps = leadData.opportunities.filter(o => o.stage !== 'WON' && o.stage !== 'LOST');
      const phase = computeLeadPhase({ ...leadData, opportunities: leadData.opportunities, _noteCount: leadCounts.notes });
      const score = calculateLeadScore(leadData, leadActiveOpps, phase, scoreConfig);
      const temp = scoreToTemperature(score);
      tempDist[temp]++;

      const idx = STAGE_INDEX[phase] ?? -1;
      if (idx > bestPhaseIndex) {
        bestPhaseIndex = idx;
        bestPhase = phase;
      }
    }

    return {
      ...c,
      leadCount: companyCounts.leads,
      activeOppCount: activeOpps.length,
      totalPipelineValue: activeOpps.reduce((sum, o) => sum + (o.value ?? 0), 0),
      bestPhase,
      tempDistribution: tempDist,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { name, website } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name erforderlich' }, { status: 400 });

  const existing = await prisma.company.findUnique({ where: { name: name.trim() } });
  if (existing) return NextResponse.json(existing);

  const company = await prisma.company.create({
    data: { name: name.trim(), website: website || null },
  });

  return NextResponse.json(company, { status: 201 });
}
