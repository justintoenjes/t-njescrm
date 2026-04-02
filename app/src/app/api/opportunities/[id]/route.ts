import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { calculateOppScoreBreakdown, oppScoreToTemperature } from '@/lib/opp-score';
import { OpportunityStage } from '@prisma/client';
import { sendPushToUser } from '@/lib/push';

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

  const [opp, config] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true, category: true, companyRef: { select: { id: true, name: true } } } },
        assignedTo: { select: { id: true, name: true } },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, name: true } } },
        },
        tasks: {
          orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }],
          include: { assignedTo: { select: { id: true, name: true } } },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
      },
    }),
    getConfig(),
  ]);

  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && opp.assignedToId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const oppBreakdown = calculateOppScoreBreakdown(opp, { daysCold: config.daysCold });
  return NextResponse.json({ ...opp, score: oppBreakdown.total, scoreBreakdown: oppBreakdown, temperature: oppScoreToTemperature(oppBreakdown.total) });
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { title, stage, hasIdentifiedNeed, isClosingReady, value, expectedCloseDate, assignedToId } = body;
  const isAdmin = session.user.role === 'ADMIN';

  // Verify user has access to this opportunity
  const existing = await prisma.opportunity.findUnique({ where: { id }, select: { assignedToId: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isAdmin && existing.assignedToId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const opp = await prisma.opportunity.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(stage !== undefined ? { stage: stage as OpportunityStage } : {}),
      ...(hasIdentifiedNeed !== undefined ? { hasIdentifiedNeed } : {}),
      ...(isClosingReady !== undefined ? { isClosingReady } : {}),
      ...(value !== undefined ? { value: value ?? null } : {}),
      ...(expectedCloseDate !== undefined ? { expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null } : {}),
      ...(isAdmin && assignedToId !== undefined ? { assignedToId: assignedToId || null } : {}),
    },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, email: true, category: true, companyRef: { select: { id: true, name: true } } } },
      assignedTo: { select: { id: true, name: true } },
      notes: {
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { id: true, name: true } } },
      },
      tasks: {
        orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }],
        include: { assignedTo: { select: { id: true, name: true } } },
      },
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
    },
  });

  // Push notification on assignment change (fire-and-forget)
  if (isAdmin && assignedToId && assignedToId !== existing.assignedToId) {
    sendPushToUser(assignedToId, {
      title: 'Neue Opportunity zugewiesen',
      body: `Dir wurde "${opp.title}" zugewiesen`,
      url: '/pipeline',
      tag: `opp-assigned-${id}`,
    }).catch(() => {});
  }

  const config = await getConfig();
  const oppBreakdown = calculateOppScoreBreakdown(opp, { daysCold: config.daysCold });
  return NextResponse.json({ ...opp, score: oppBreakdown.total, scoreBreakdown: oppBreakdown, temperature: oppScoreToTemperature(oppBreakdown.total) });
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.opportunity.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
