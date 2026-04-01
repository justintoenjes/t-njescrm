import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getToken } from 'next-auth/jwt';

type Ctx = { params: Promise<{ id: string }> };

// GET: Return persisted emails from DB (fast, no Graph call)
export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lead = await prisma.lead.findUnique({ where: { id }, select: { assignedToId: true } });
  if (!lead) return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && lead.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const emails = await prisma.email.findMany({
    where: { leadId: id },
    orderBy: { receivedAt: 'desc' },
  });

  return NextResponse.json({
    emails: emails.map(e => ({
      id: e.id,
      graphMessageId: e.graphMessageId,
      subject: e.subject,
      from: e.fromName ?? e.fromEmail,
      fromEmail: e.fromEmail,
      to: parseRecipients(e.toRecipients),
      date: e.receivedAt.toISOString(),
      preview: e.bodyPreview ?? '',
      isRead: e.isRead,
      hasAttachments: e.hasAttachments,
      direction: e.direction,
    })),
  });
}

// POST: Sync emails from Microsoft Graph into DB, then return updated list
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.accessToken) {
    return NextResponse.json({ error: 'Keine Microsoft-Verbindung. Bitte mit Microsoft anmelden.' }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { email: true, assignedToId: true, lastContactedAt: true },
  });
  if (!lead) return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 });
  if (!lead.email) return NextResponse.json({ emails: [], message: 'Lead hat keine E-Mail-Adresse' });

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && lead.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchQuery = `participants:${lead.email}`;
  const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(searchQuery)}"&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments&$top=50`;

  try {
    const res = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) {
        return NextResponse.json({ error: 'Microsoft-Token abgelaufen. Bitte neu anmelden.' }, { status: 401 });
      }
      return NextResponse.json({ error: err?.error?.message ?? 'Graph API Fehler' }, { status: res.status });
    }

    const data = await res.json();
    const messages: any[] = data.value ?? [];

    // Upsert each message into DB
    for (const msg of messages) {
      const fromEmail = msg.from?.emailAddress?.address ?? '';
      const fromName = msg.from?.emailAddress?.name ?? null;
      const toRecipients = JSON.stringify(
        (msg.toRecipients ?? []).map((r: any) => ({
          name: r.emailAddress?.name ?? '',
          address: r.emailAddress?.address ?? '',
        }))
      );
      const direction = fromEmail.toLowerCase() === lead.email.toLowerCase() ? 'INBOUND' : 'OUTBOUND';

      await prisma.email.upsert({
        where: { graphMessageId_leadId: { graphMessageId: msg.id, leadId: id } },
        create: {
          graphMessageId: msg.id,
          subject: msg.subject ?? null,
          fromName,
          fromEmail,
          toRecipients,
          receivedAt: new Date(msg.receivedDateTime),
          bodyPreview: msg.bodyPreview ?? null,
          isRead: msg.isRead ?? false,
          hasAttachments: msg.hasAttachments ?? false,
          direction,
          leadId: id,
        },
        update: {
          isRead: msg.isRead ?? false,
          subject: msg.subject ?? null,
        },
      });
    }

    // Update lastContactedAt if newest email is more recent
    const newestEmail = await prisma.email.findFirst({
      where: { leadId: id },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    });

    if (newestEmail) {
      const currentContact = lead.lastContactedAt;
      if (!currentContact || newestEmail.receivedAt > currentContact) {
        await prisma.lead.update({
          where: { id },
          data: { lastContactedAt: newestEmail.receivedAt },
        });
      }
    }

    // Return full list from DB
    const emails = await prisma.email.findMany({
      where: { leadId: id },
      orderBy: { receivedAt: 'desc' },
    });

    return NextResponse.json({
      emails: emails.map(e => ({
        id: e.id,
        graphMessageId: e.graphMessageId,
        subject: e.subject,
        from: e.fromName ?? e.fromEmail,
        fromEmail: e.fromEmail,
        to: parseRecipients(e.toRecipients),
        date: e.receivedAt.toISOString(),
        preview: e.bodyPreview ?? '',
        isRead: e.isRead,
        hasAttachments: e.hasAttachments,
        direction: e.direction,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Verbindung zu Microsoft fehlgeschlagen' }, { status: 502 });
  }
}

function parseRecipients(json: string): string {
  try {
    const arr = JSON.parse(json) as { name: string; address: string }[];
    return arr.map(r => r.name || r.address).join(', ');
  } catch {
    return '';
  }
}
