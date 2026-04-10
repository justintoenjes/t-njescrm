import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { createCalendarEventForUser } from '@/lib/microsoft-graph';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find all open tasks with dueDate but no calendarEventId
  const tasks = await prisma.task.findMany({
    where: {
      isCompleted: false,
      dueDate: { not: null },
      calendarEventId: null,
      assignedToId: { not: null },
    },
    include: {
      assignedTo: { select: { email: true } },
    },
  });

  let synced = 0;
  let failed = 0;

  for (const task of tasks) {
    if (!task.assignedTo?.email || !task.dueDate) continue;
    try {
      const event = await createCalendarEventForUser(task.assignedTo.email, {
        subject: `📋 ${task.title}`,
        start: task.dueDate,
        durationMinutes: 30,
        body: task.description || undefined,
        reminderMinutes: task.reminderMinutes ?? 15,
        isAllDay: true,
      });
      if (event?.id) {
        await prisma.task.update({ where: { id: task.id }, data: { calendarEventId: event.id } });
        synced++;
      }
    } catch (e) {
      console.error(`[Calendar Sync] Failed for task ${task.id}:`, e);
      failed++;
    }
  }

  return NextResponse.json({ total: tasks.length, synced, failed });
}
