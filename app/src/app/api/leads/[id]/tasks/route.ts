import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { sendPushToUser } from '@/lib/push';

type Ctx = { params: Promise<{ id: string }> };

async function canAccess(leadId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true } });
  return lead?.assignedToId === userId;
}

export async function GET(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isAdmin = session.user.role === 'ADMIN';
  if (!await canAccess(id, session.user.id, isAdmin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const tasks = await prisma.task.findMany({
    where: { leadId: id },
    include: { assignedTo: { select: { id: true, name: true } } },
    orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }],
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isAdmin = session.user.role === 'ADMIN';
  if (!await canAccess(id, session.user.id, isAdmin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { title, dueDate, assignedToId } = body;
  if (!title) return NextResponse.json({ error: 'title erforderlich' }, { status: 400 });

  const [task] = await prisma.$transaction([
    prisma.task.create({
      data: {
        title,
        dueDate: dueDate ? new Date(dueDate) : null,
        leadId: id,
        assignedToId: isAdmin ? (assignedToId ?? session.user.id) : session.user.id,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    }),
    prisma.lead.update({
      where: { id },
      data: { missedCallsCount: 0, noShowCount: 0 },
    }),
  ]);
  // Push to assigned user if different from creator
  const taskOwner = task.assignedToId;
  if (taskOwner && taskOwner !== session.user.id) {
    sendPushToUser(taskOwner, {
      title: 'Neue Aufgabe',
      body: `"${task.title}"${task.dueDate ? ` — fällig ${new Date(task.dueDate).toLocaleDateString('de-DE')}` : ''}`,
      url: '/tasks',
      tag: `task-created-${task.id}`,
    }).catch(() => {});
  }

  return NextResponse.json(task, { status: 201 });
}
