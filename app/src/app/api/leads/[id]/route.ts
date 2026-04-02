import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeLeadPhase } from '@/lib/phase';
import { calculateLeadScore, calculateLeadScoreBreakdown, scoreToTemperature } from '@/lib/lead-score';
import { calculateOppScoreBreakdown, oppScoreToTemperature } from '@/lib/opp-score';
import { normalizePhone } from '@/lib/phone';
import { sendPushToUser } from '@/lib/push';

type Ctx = { params: Promise<{ id: string }> };

async function canAccess(leadId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true } });
  return lead?.assignedToId === userId;
}

async function enrichLead(lead: NonNullable<Awaited<ReturnType<typeof fetchLead>>>, daysWarm: number, daysCold: number) {
  const activeOpps = lead.opportunities.filter(o => o.stage !== 'WON' && o.stage !== 'LOST');
  const phase = computeLeadPhase({ ...lead, opportunities: lead.opportunities, _noteCount: lead.notes.length });
  const config = { daysWarm, daysCold };
  const score = calculateLeadScore(lead, activeOpps, phase, config);
  const scoreBreakdown = calculateLeadScoreBreakdown(lead, activeOpps, phase, config);
  return {
    ...lead,
    phase,
    score,
    scoreBreakdown,
    temperature: scoreToTemperature(score),
    opportunities: lead.opportunities.map(o => {
      const oppBreakdown = calculateOppScoreBreakdown(o, { daysCold });
      return {
        ...o,
        score: oppBreakdown.total,
        scoreBreakdown: oppBreakdown,
        temperature: oppScoreToTemperature(oppBreakdown.total),
      };
    }),
  };
}

async function fetchLead(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      companyRef: { select: { id: true, name: true } },
      opportunities: {
        select: {
          id: true, title: true, stage: true, hasIdentifiedNeed: true, isClosingReady: true,
          lastActivityAt: true, createdAt: true, value: true, expectedCloseDate: true, aiSentimentScore: true,
          notes: {
            orderBy: { createdAt: 'desc' as const },
            include: { author: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
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
}

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
  const isAdmin = session.user.role === 'ADMIN';
  if (!await canAccess(id, session.user.id, isAdmin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [lead, { daysWarm, daysCold }] = await Promise.all([fetchLead(id), getConfig()]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await enrichLead(lead, daysWarm, daysCold));
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isAdmin = session.user.role === 'ADMIN';
  if (!await canAccess(id, session.user.id, isAdmin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { name, companyId, email, phone, archived, assignedToId, formalAddress } = body;

  // Track assignment change for push notification
  const oldLead = (isAdmin && assignedToId !== undefined)
    ? await prisma.lead.findUnique({ where: { id }, select: { assignedToId: true, name: true } })
    : null;

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(companyId !== undefined ? { companyId: companyId || null } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(phone !== undefined ? { phone: normalizePhone(phone) || null } : {}),
      ...(archived !== undefined ? { archived } : {}),
      ...(formalAddress !== undefined ? { formalAddress } : {}),
      ...(isAdmin && assignedToId !== undefined ? { assignedToId: assignedToId || null } : {}),
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      companyRef: { select: { id: true, name: true } },
      opportunities: {
        select: {
          id: true, title: true, stage: true, hasIdentifiedNeed: true, isClosingReady: true,
          lastActivityAt: true, createdAt: true, value: true, expectedCloseDate: true, aiSentimentScore: true,
          notes: {
            orderBy: { createdAt: 'desc' as const },
            include: { author: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
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
  if (oldLead && assignedToId && assignedToId !== oldLead.assignedToId) {
    sendPushToUser(assignedToId, {
      title: 'Neuer Lead zugewiesen',
      body: `Dir wurde "${updated.name}" zugewiesen`,
      url: '/',
      tag: `lead-assigned-${id}`,
    }).catch(() => {});
  }

  const { daysWarm, daysCold } = await getConfig();
  return NextResponse.json(await enrichLead(updated, daysWarm, daysCold));
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
