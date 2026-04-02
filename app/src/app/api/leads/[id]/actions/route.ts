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

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isAdmin = session.user.role === 'ADMIN';
  if (!await canAccess(id, session.user.id, isAdmin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { action } = body;

  if (action === 'missedCall') {
    const lead = await prisma.lead.update({
      where: { id },
      data: { missedCallsCount: { increment: 1 } },
      select: { missedCallsCount: true, noShowCount: true, name: true, assignedToId: true },
    });
    if (lead.assignedToId) {
      sendPushToUser(lead.assignedToId, {
        title: 'Verpasster Anruf',
        body: `${lead.name} — ${lead.missedCallsCount}x nicht erreicht`,
        url: '/',
        tag: `missed-call-${id}`,
      }).catch(() => {});
    }
    return NextResponse.json({ missedCallsCount: lead.missedCallsCount, noShowCount: lead.noShowCount });
  }
  if (action === 'noShow') {
    const lead = await prisma.lead.update({
      where: { id },
      data: { noShowCount: { increment: 1 } },
      select: { missedCallsCount: true, noShowCount: true, name: true, assignedToId: true },
    });
    if (lead.assignedToId) {
      sendPushToUser(lead.assignedToId, {
        title: 'No-Show',
        body: `${lead.name} ist nicht erschienen (${lead.noShowCount}x)`,
        url: '/',
        tag: `no-show-${id}`,
      }).catch(() => {});
    }
    return NextResponse.json({ missedCallsCount: lead.missedCallsCount, noShowCount: lead.noShowCount });
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
