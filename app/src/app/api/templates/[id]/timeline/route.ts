import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const template = await prisma.productTemplate.findUnique({
    where: { id },
    select: {
      opportunities: {
        select: { id: true, leadId: true },
      },
    },
  });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const oppIds = template.opportunities.map(o => o.id);
  const leadIds = Array.from(new Set(template.opportunities.map(o => o.leadId)));

  if (oppIds.length === 0) {
    return NextResponse.json({ notes: [], emails: [] });
  }

  const [notes, emails] = await Promise.all([
    prisma.note.findMany({
      where: {
        OR: [
          { opportunityId: { in: oppIds } },
          { leadId: { in: leadIds } },
        ],
      },
      include: {
        author: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true, lead: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    }),
    prisma.email.findMany({
      where: { leadId: { in: leadIds } },
      include: {
        lead: { select: { id: true, name: true } },
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
    contextLabel: n.opportunity?.lead?.name ?? n.lead?.name ?? null,
    source: n.opportunityId
      ? { type: 'opportunity' as const, label: n.opportunity!.title, id: n.opportunityId }
      : { type: 'lead' as const, label: n.lead?.name ?? 'Kontakt', id: n.leadId! },
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
    contextLabel: e.lead?.name ?? null,
  }));

  return NextResponse.json({ notes: mappedNotes, emails: mappedEmails });
}
