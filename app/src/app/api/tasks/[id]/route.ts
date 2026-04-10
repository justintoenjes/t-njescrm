import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { createCalendarEventForUser, deleteCalendarEventForUser } from '@/lib/microsoft-graph';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, title: true, lead: { select: { id: true, firstName: true, lastName: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && task.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(task);
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && task.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { title, description, dueDate, isCompleted, assignedToId, reminderMinutes } = body;
  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(isCompleted !== undefined ? { isCompleted } : {}),
      ...(assignedToId !== undefined && isAdmin ? { assignedToId: assignedToId || null } : {}),
      ...(reminderMinutes !== undefined ? { reminderMinutes } : {}),
    },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, title: true, lead: { select: { id: true, firstName: true, lastName: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  // Sync calendar event when dueDate changes
  if (dueDate !== undefined) {
    const effectiveUserId = updated.assignedToId ?? task.assignedToId;
    try {
      const assignedUser = effectiveUserId
        ? await prisma.user.findUnique({ where: { id: effectiveUserId }, select: { email: true } })
        : null;
      if (assignedUser?.email) {
        // Delete old event if exists
        if (task.calendarEventId) {
          try {
            await deleteCalendarEventForUser(assignedUser.email, task.calendarEventId);
          } catch { /* Event may already be deleted */ }
        }
        // Create new event if dueDate is set
        const parsedDueDate = dueDate ? new Date(dueDate) : null;
        if (parsedDueDate) {
          const reminder = reminderMinutes ?? updated.reminderMinutes ?? 15;
          const event = await createCalendarEventForUser(assignedUser.email, {
            subject: `📋 ${updated.title}`,
            start: parsedDueDate,
            durationMinutes: 30,
            body: updated.description || undefined,
            reminderMinutes: reminder,
            isAllDay: !dueDate.includes('T'),
          });
          if (event?.id) {
            await prisma.task.update({ where: { id }, data: { calendarEventId: event.id } });
          }
        } else {
          await prisma.task.update({ where: { id }, data: { calendarEventId: null } });
        }
      }
    } catch (e) {
      console.error('[Calendar] Failed to sync event for task:', id, e);
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && task.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
