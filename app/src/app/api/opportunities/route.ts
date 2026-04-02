import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { calculateOppScoreBreakdown, oppScoreToTemperature } from '@/lib/opp-score';
import { OpportunityStage, LeadCategory } from '@prisma/client';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const stageFilter = searchParams.get('stage') as OpportunityStage | null;
  const categoryFilter = searchParams.get('category') as LeadCategory | null;
  const isAdmin = session.user.role === 'ADMIN';
  const now = new Date();

  const [opps, configs] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        ...(isAdmin ? {} : { assignedToId: session.user.id }),
        ...(stageFilter ? { stage: stageFilter } : {}),
        ...(categoryFilter ? { lead: { category: categoryFilter } } : {}),
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, category: true, companyRef: { select: { id: true, name: true } } } },
        assignedTo: { select: { id: true, name: true } },
        tasks: { where: { isCompleted: false, dueDate: { lt: now } }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.globalConfig.findMany({ where: { key: { in: ['days_warm', 'days_cold'] } } }),
  ]);

  const daysWarm = parseInt(configs.find(c => c.key === 'days_warm')?.value ?? '14');
  const daysCold = parseInt(configs.find(c => c.key === 'days_cold')?.value ?? '30');

  const result = opps.map(({ tasks, ...opp }) => {
    const oppBreakdown = calculateOppScoreBreakdown(opp, { daysCold });
    return {
      ...opp,
      score: oppBreakdown.total,
      scoreBreakdown: oppBreakdown,
      temperature: oppScoreToTemperature(oppBreakdown.total),
      hasOverdueTasks: tasks.length > 0,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { title, leadId, stage, value, expectedCloseDate, assignedToId, templateId } = body;
  if (!title || !leadId) return NextResponse.json({ error: 'title und leadId erforderlich' }, { status: 400 });

  const isAdmin = session.user.role === 'ADMIN';

  // Verify user has access to the lead
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true } });
  if (!lead) return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 });
  if (!isAdmin && lead.assignedToId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const opp = await prisma.opportunity.create({
    data: {
      title,
      leadId,
      stage: stage ?? 'PROPOSAL',
      value: value ?? null,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      assignedToId: isAdmin ? (assignedToId ?? session.user.id) : session.user.id,
      templateId: templateId ?? null,
    },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, companyRef: { select: { id: true, name: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const oppBreakdown = calculateOppScoreBreakdown(opp, { daysCold: 30 });
  return NextResponse.json({ ...opp, score: oppBreakdown.total, scoreBreakdown: oppBreakdown, temperature: oppScoreToTemperature(oppBreakdown.total), hasOverdueTasks: false }, { status: 201 });
}
