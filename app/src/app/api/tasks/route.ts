import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { LeadCategory } from '@prisma/client';
import { syncTaskCalendarEvent } from '@/lib/task-calendar';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter');
  const categoryFilter = searchParams.get('category') as LeadCategory | null;
  const isAdmin = session.user.role === 'ADMIN';
  const now = new Date();

  const categoryWhere = categoryFilter ? {
    OR: [
      { lead: { category: categoryFilter } },
      { opportunity: { lead: { category: categoryFilter } } },
    ],
  } : {};

  const tasks = await prisma.task.findMany({
    where: {
      ...(isAdmin ? {} : { assignedToId: session.user.id }),
      ...(filter === 'overdue'   ? { isCompleted: false, dueDate: { lt: now } } : {}),
      ...(filter === 'completed' ? { isCompleted: true } : {}),
      ...(filter === 'pending'   ? { isCompleted: false } : {}),
      ...categoryWhere,
    },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, companyRef: { select: { id: true, name: true } } } },
      opportunity: {
        select: {
          id: true, title: true,
          lead: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { title, description, dueDate, assignedToId, leadId, opportunityId, reminderMinutes } = body;
  if (!title?.trim()) return NextResponse.json({ error: 'Titel erforderlich' }, { status: 400 });

  const isAdmin = session.user.role === 'ADMIN';
  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  const reminder = reminderMinutes !== undefined ? reminderMinutes : (parsedDueDate ? 15 : null);

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      dueDate: parsedDueDate,
      reminderMinutes: reminder,
      assignedToId: isAdmin && assignedToId ? assignedToId : session.user.id,
      leadId: leadId || null,
      opportunityId: opportunityId || null,
    },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, title: true, lead: { select: { id: true, firstName: true, lastName: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  // Create Outlook calendar event in assigned user's calendar
  await syncTaskCalendarEvent({ ...task, reminderMinutes: reminder }, dueDate);

  return NextResponse.json(task, { status: 201 });
}
