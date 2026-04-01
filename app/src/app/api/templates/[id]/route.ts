import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeLeadPhase } from '@/lib/phase';
import { calculateLeadScore, scoreToTemperature } from '@/lib/lead-score';
import { TERMINAL_STAGES } from '@/lib/opportunity';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [template, configs] = await Promise.all([
    prisma.productTemplate.findUnique({
      where: { id },
      include: {
        opportunities: {
          include: {
            lead: {
              include: {
                assignedTo: { select: { id: true, name: true } },
                opportunities: {
                  select: { id: true, title: true, stage: true, hasIdentifiedNeed: true, isClosingReady: true, lastActivityAt: true, value: true, expectedCloseDate: true, aiSentimentScore: true },
                },
                _count: { select: { notes: true } },
              },
            },
          },
        },
      },
    }),
    prisma.globalConfig.findMany({ where: { key: { in: ['days_warm', 'days_cold'] } } }),
  ]);

  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const daysWarm = parseInt(configs.find(c => c.key === 'days_warm')?.value ?? '14');
  const daysCold = parseInt(configs.find(c => c.key === 'days_cold')?.value ?? '30');
  const scoreConfig = { daysWarm, daysCold };

  // Deduplicate by lead.id, pick the furthest opp stage for this template
  const leadMap = new Map<string, { lead: any; oppStage: string }>();
  for (const opp of template.opportunities) {
    const existing = leadMap.get(opp.lead.id);
    if (!existing || !TERMINAL_STAGES.includes(opp.stage as any)) {
      leadMap.set(opp.lead.id, { lead: opp.lead, oppStage: opp.stage });
    }
  }

  const candidates = Array.from(leadMap.values()).map(({ lead, oppStage }) => {
    const { _count, ...rest } = lead;
    const activeOpps = rest.opportunities.filter((o: any) => !TERMINAL_STAGES.includes(o.stage));
    const phase = computeLeadPhase({ ...rest, opportunities: rest.opportunities, _noteCount: _count.notes });
    const score = calculateLeadScore(rest, activeOpps, phase, scoreConfig);
    return {
      ...rest,
      phase,
      score,
      temperature: scoreToTemperature(score),
      oppStage, // stage for THIS template's opportunity
    };
  });

  const { opportunities, ...templateData } = template;
  return NextResponse.json({
    ...templateData,
    candidateCount: candidates.length,
    candidates,
  });
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { name, description, defaultValue } = body;

  const template = await prisma.productTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(defaultValue !== undefined ? { defaultValue: defaultValue ?? null } : {}),
    },
    include: { _count: { select: { opportunities: true } } },
  });
  return NextResponse.json(template);
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  await prisma.productTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
