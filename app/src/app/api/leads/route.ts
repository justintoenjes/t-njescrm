import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { calculateOppScoreBreakdown, oppScoreToTemperature } from '@/lib/opp-score';
import { computeLeadPhase, LeadPhase } from '@/lib/phase';
import { calculateLeadScore, calculateLeadScoreBreakdown, scoreToTemperature } from '@/lib/lead-score';
import { LeadCategory } from '@prisma/client';
import { normalizePhone } from '@/lib/phone';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const phaseFilter = searchParams.get('phase') as LeadPhase | null;
  const tempFilter = searchParams.get('temperature');
  const categoryFilter = searchParams.get('category') as LeadCategory | null;
  const showArchived = searchParams.get('archived') === 'true';
  const companyId = searchParams.get('companyId');
  const templateId = searchParams.get('templateId');
  const isAdmin = session.user.role === 'ADMIN';
  const now = new Date();

  const [leads, configs] = await Promise.all([
    prisma.lead.findMany({
      where: {
        AND: [
          isAdmin ? {} : { assignedToId: session.user.id },
          categoryFilter ? { category: categoryFilter } : {},
          (!showArchived && phaseFilter !== 'ARCHIVIERT') ? { archived: false } : {},
          companyId ? { companyId } : {},
          templateId ? { opportunities: { some: { templateId } } } : {},
          search ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { companyRef: { name: { contains: search, mode: 'insensitive' } } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          } : {},
        ],
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        companyRef: { select: { id: true, name: true } },
        opportunities: {
          select: { id: true, title: true, stage: true, hasIdentifiedNeed: true, isClosingReady: true, lastActivityAt: true, value: true, expectedCloseDate: true, aiSentimentScore: true },
        },
        tasks: { where: { isCompleted: false, dueDate: { lt: now } }, select: { id: true } },
        _count: { select: { notes: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.globalConfig.findMany({ where: { key: { in: ['days_warm', 'days_cold'] } } }),
  ]);

  const daysWarm = parseInt(configs.find(c => c.key === 'days_warm')?.value ?? '14');
  const daysCold = parseInt(configs.find(c => c.key === 'days_cold')?.value ?? '30');
  const scoreConfig = { daysWarm, daysCold };

  const withScores = leads.map(({ tasks, opportunities, _count, ...lead }) => {
    const activeOpps = opportunities.filter(o => o.stage !== 'WON' && o.stage !== 'LOST');
    const phase = computeLeadPhase({ ...lead, opportunities, _noteCount: _count.notes });
    const score = calculateLeadScore(lead, activeOpps, phase, scoreConfig);
    const scoreBreakdown = calculateLeadScoreBreakdown(lead, activeOpps, phase, scoreConfig);
    return {
      ...lead,
      phase,
      score,
      scoreBreakdown,
      temperature: scoreToTemperature(score),
      hasOverdueTasks: tasks.length > 0,
      opportunities: opportunities.map(o => {
        const oppBreakdown = calculateOppScoreBreakdown(o, { daysCold });
        return {
          ...o,
          score: oppBreakdown.total,
          scoreBreakdown: oppBreakdown,
          temperature: oppScoreToTemperature(oppBreakdown.total),
        };
      }),
    };
  });

  // Sort by score descending (most urgent first)
  withScores.sort((a, b) => b.score - a.score);

  let result = withScores;
  if (phaseFilter) result = result.filter(l => l.phase === phaseFilter);
  if (tempFilter) result = result.filter(l => l.temperature === tempFilter);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { firstName, lastName, companyId, email, phone, assignedToId, category } = body;
  const isAdmin = session.user.role === 'ADMIN';

  const lead = await prisma.lead.create({
    data: {
      firstName: firstName ?? '',
      lastName: lastName ?? '',
      companyId: companyId || null,
      email: email || null,
      phone: normalizePhone(phone) || null,
      category: category || 'VERTRIEB',
      assignedToId: isAdmin ? (assignedToId ?? null) : session.user.id,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      companyRef: { select: { id: true, name: true } },
      opportunities: { select: { id: true, title: true, stage: true, hasIdentifiedNeed: true, isClosingReady: true, lastActivityAt: true, value: true, expectedCloseDate: true } },
    },
  });
  // New lead: NEU phase, score 50 (40 contact decay + 10 phase bonus), hot
  return NextResponse.json({ ...lead, phase: 'NEU', score: 50, temperature: 'hot', hasOverdueTasks: false }, { status: 201 });
}
