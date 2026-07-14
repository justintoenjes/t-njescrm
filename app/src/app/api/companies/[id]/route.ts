import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeLeadPhase } from '@/lib/phase';
import { calculateLeadScore, scoreToTemperature } from '@/lib/lead-score';
import { isLeadOwner } from '@/lib/permissions';

type Ctx = { params: Promise<{ id: string }> };

async function getConfig() {
  const configs = await prisma.globalConfig.findMany({ where: { key: { in: ['days_warm', 'days_cold'] } } });
  return {
    daysWarm: parseInt(configs.find(c => c.key === 'days_warm')?.value ?? '14'),
    daysCold: parseInt(configs.find(c => c.key === 'days_cold')?.value ?? '30'),
  };
}

export async function GET(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [company, config] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      include: {
        tags: { select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } },
        leads: {
          include: {
            assignedTo: { select: { id: true, name: true } },
            opportunities: {
              select: { id: true, title: true, stage: true, hasIdentifiedNeed: true, isClosingReady: true, lastActivityAt: true, value: true, expectedCloseDate: true, aiSentimentScore: true },
            },
            _count: { select: { notes: true } },
          },
        },
      },
    }),
    getConfig(),
  ]);

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  const scoreConfig = { daysWarm: config.daysWarm, daysCold: config.daysCold };

  // Every authenticated user can see the company as a shared contact directory (avoids
  // duplicate contact creation), but only their own leads expose opportunities/scoring —
  // that's the sensitive, deal-related data.
  const leads = company.leads.map(({ _count, opportunities, ...lead }) => {
    if (!isLeadOwner(lead, session.user.id, isAdmin)) {
      return {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        category: lead.category,
        restricted: true as const,
        opportunities: [] as typeof opportunities,
      };
    }
    const activeOpps = opportunities.filter(o => o.stage !== 'WON' && o.stage !== 'LOST');
    const phase = computeLeadPhase({ ...lead, opportunities, _noteCount: _count.notes });
    const score = calculateLeadScore(lead, activeOpps, phase, scoreConfig);
    return { ...lead, opportunities, phase, score, temperature: scoreToTemperature(score), restricted: false as const };
  });

  const allActiveOpps = leads.flatMap(l => l.opportunities.filter(o => o.stage !== 'WON' && o.stage !== 'LOST'));

  return NextResponse.json({
    ...company,
    leads,
    activeOppCount: allActiveOpps.length,
    totalPipelineValue: allActiveOpps.reduce((sum, o) => sum + (o.value ?? 0), 0),
  });
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { name, website } = body;
  const company = await prisma.company.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(website !== undefined ? { website: website || null } : {}),
    },
  });

  return NextResponse.json(company);
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
