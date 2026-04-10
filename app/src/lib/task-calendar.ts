import { prisma } from '@/lib/prisma';
import { createCalendarEventForUser, deleteCalendarEventForUser } from '@/lib/microsoft-graph';

/**
 * Create an Outlook calendar event for a task.
 * Call this after task creation when dueDate is set.
 * Fails silently — never blocks task creation.
 */
export async function syncTaskCalendarEvent(task: {
  id: string;
  title: string;
  description?: string | null;
  dueDate: Date | null;
  assignedToId: string | null;
  reminderMinutes?: number | null;
  calendarEventId?: string | null;
}, rawDueDate?: string) {
  if (!task.dueDate || !task.assignedToId) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: task.assignedToId },
      select: { email: true },
    });
    if (!user?.email) {
      console.log('[Calendar] No email for user:', task.assignedToId);
      return;
    }

    // Delete old event if updating
    if (task.calendarEventId) {
      try {
        await deleteCalendarEventForUser(user.email, task.calendarEventId);
      } catch { /* Event may already be deleted */ }
    }

    const isAllDay = !rawDueDate || !rawDueDate.includes('T');
    console.log('[Calendar] Creating event:', { taskId: task.id, userEmail: user.email, isAllDay, dueDate: task.dueDate });

    const baseUrl = process.env.NEXTAUTH_URL || 'https://microcrm';
    const taskUrl = `${baseUrl}/tasks`;
    const bodyParts = [task.description, `Aufgabe im CRM öffnen: ${taskUrl}`].filter(Boolean).join('\n\n');

    const event = await createCalendarEventForUser(user.email, {
      subject: `[CRM] ${task.title}`,
      start: task.dueDate,
      durationMinutes: 30,
      body: bodyParts,
      reminderMinutes: task.reminderMinutes ?? 15,
      isAllDay,
    });

    if (event?.id) {
      await prisma.task.update({ where: { id: task.id }, data: { calendarEventId: event.id } });
      console.log('[Calendar] Event created:', event.id);
      return event.id;
    }
  } catch (e: any) {
    console.error('[Calendar] Failed for task:', task.id, e?.message ?? e);
  }
}

/**
 * Delete the calendar event for a task (e.g. when dueDate is removed).
 */
export async function deleteTaskCalendarEvent(task: {
  calendarEventId: string | null;
  assignedToId: string | null;
}) {
  if (!task.calendarEventId || !task.assignedToId) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: task.assignedToId },
      select: { email: true },
    });
    if (!user?.email) return;
    await deleteCalendarEventForUser(user.email, task.calendarEventId);
  } catch { /* ignore */ }
}
