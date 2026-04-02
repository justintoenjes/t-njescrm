import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendPushToUser } from '@/lib/push';

/**
 * Periodic reminder check — call via cron or callmonitor.
 * Protected by a shared secret (PUSH_CRON_SECRET) to prevent abuse.
 *
 * Checks:
 * 1. Tasks due today or overdue (not completed)
 * 2. Leads that have gone cold (lastContactedAt > days_cold)
 */
export async function POST(request: NextRequest) {
  // Auth: check cron secret
  const secret = request.headers.get('x-cron-secret') ?? '';
  if (!process.env.PUSH_CRON_SECRET || secret !== process.env.PUSH_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // 1. Tasks due today or overdue
  const dueTasks = await prisma.task.findMany({
    where: {
      isCompleted: false,
      dueDate: { lte: endOfToday },
      assignedToId: { not: null },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      assignedToId: true,
    },
  });

  // Group by user to batch notifications
  const tasksByUser = new Map<string, typeof dueTasks>();
  for (const task of dueTasks) {
    const uid = task.assignedToId!;
    if (!tasksByUser.has(uid)) tasksByUser.set(uid, []);
    tasksByUser.get(uid)!.push(task);
  }

  let taskPushes = 0;
  for (const [userId, tasks] of Array.from(tasksByUser)) {
    const count = tasks.length;
    const firstTitle = tasks[0].title;
    await sendPushToUser(userId, {
      title: `${count} Aufgabe${count > 1 ? 'n' : ''} fällig`,
      body: count === 1 ? firstTitle : `${firstTitle} und ${count - 1} weitere`,
      url: '/tasks',
      tag: 'tasks-due',
    }).catch(() => {});
    taskPushes++;
  }

  // 2. Leads gone cold
  const config = await prisma.globalConfig.findMany({
    where: { key: { in: ['days_cold'] } },
  });
  const daysCold = parseInt(config.find(c => c.key === 'days_cold')?.value ?? '30', 10);
  const coldThreshold = new Date(now.getTime() - daysCold * 24 * 60 * 60 * 1000);

  const coldLeads = await prisma.lead.findMany({
    where: {
      archived: false,
      assignedToId: { not: null },
      lastContactedAt: { lt: coldThreshold, not: null },
    },
    select: {
      id: true,
      name: true,
      assignedToId: true,
      lastContactedAt: true,
    },
  });

  // Group by user
  const coldByUser = new Map<string, typeof coldLeads>();
  for (const lead of coldLeads) {
    const uid = lead.assignedToId!;
    if (!coldByUser.has(uid)) coldByUser.set(uid, []);
    coldByUser.get(uid)!.push(lead);
  }

  let coldPushes = 0;
  for (const [userId, leads] of Array.from(coldByUser)) {
    const count = leads.length;
    const firstName = leads[0].name;
    await sendPushToUser(userId, {
      title: `${count} Lead${count > 1 ? 's' : ''} kalt`,
      body: count === 1 ? `${firstName} — kein Kontakt seit ${daysCold}+ Tagen` : `${firstName} und ${count - 1} weitere`,
      url: '/',
      tag: 'leads-cold',
    }).catch(() => {});
    coldPushes++;
  }

  return NextResponse.json({ taskPushes, coldPushes, dueTasks: dueTasks.length, coldLeads: coldLeads.length });
}
