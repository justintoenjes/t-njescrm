import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const company = await prisma.company.findUnique({
    where: { id },
    select: { leads: { select: { id: true, assignedToId: true } } },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && !company.leads.some(l => l.assignedToId === session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const leadIds = company.leads.map(l => l.id);
  if (leadIds.length === 0) {
    return NextResponse.json({ notes: [], emails: [] });
  }

  const [notes, emails] = await Promise.all([
    prisma.note.findMany({
      where: {
        OR: [
          { leadId: { in: leadIds } },
          { opportunity: { leadId: { in: leadIds } } },
        ],
      },
      include: {
        author: { select: { id: true, name: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, title: true, lead: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    }),
    prisma.email.findMany({
      where: { leadId: { in: leadIds } },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    }),
  ]);

  const mappedNotes = notes.map(n => ({
    id: n.id,
    content: n.content,
    isAiGenerated: n.isAiGenerated,
    createdAt: n.createdAt.toISOString(),
    author: n.author,
    contextLabel: n.lead ? `${n.lead.firstName} ${n.lead.lastName}`.trim() : n.opportunity?.lead ? `${n.opportunity.lead.firstName} ${n.opportunity.lead.lastName}`.trim() : null,
    source: n.opportunityId
      ? { type: 'opportunity' as const, label: n.opportunity!.title, id: n.opportunityId }
      : { type: 'lead' as const, label: n.lead ? `${n.lead.firstName} ${n.lead.lastName}`.trim() : 'Kontakt', id: n.leadId! },
  }));

  const mappedEmails = emails.map(e => ({
    id: e.id,
    graphMessageId: e.graphMessageId,
    subject: e.subject,
    from: e.fromName,
    fromEmail: e.fromEmail,
    to: e.toRecipients,
    date: e.receivedAt.toISOString(),
    preview: e.bodyPreview ?? '',
    isRead: e.isRead,
    hasAttachments: e.hasAttachments,
    direction: e.direction as 'INBOUND' | 'OUTBOUND',
    contextLabel: e.lead ? `${e.lead.firstName} ${e.lead.lastName}`.trim() : null,
  }));

  return NextResponse.json({ notes: mappedNotes, emails: mappedEmails });
}
