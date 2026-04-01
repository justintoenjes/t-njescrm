import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getToken } from 'next-auth/jwt';

type Ctx = { params: Promise<{ msgId: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { msgId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.user.role === 'ADMIN';

  // Check DB cache first (msgId could be graphMessageId or email.id)
  const cached = await prisma.email.findFirst({
    where: {
      OR: [{ graphMessageId: msgId }, { id: msgId }],
      ...(isAdmin ? {} : { lead: { assignedToId: session.user.id } }),
    },
    select: { id: true, graphMessageId: true, bodyHtml: true, subject: true, fromName: true, fromEmail: true, toRecipients: true, receivedAt: true },
  });

  if (cached?.bodyHtml) {
    return NextResponse.json({
      subject: cached.subject,
      from: cached.fromName ?? cached.fromEmail,
      to: parseRecipients(cached.toRecipients),
      date: cached.receivedAt.toISOString(),
      bodyHtml: cached.bodyHtml,
    });
  }

  // Not cached — fetch from Graph
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.accessToken) {
    return NextResponse.json({ error: 'Keine Microsoft-Verbindung' }, { status: 403 });
  }

  const graphId = cached?.graphMessageId ?? msgId;
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${graphId}?$select=subject,body,from,toRecipients,receivedDateTime`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  if (!res.ok) return NextResponse.json({ error: 'E-Mail nicht gefunden' }, { status: res.status });

  const msg = await res.json();
  const bodyHtml = msg.body?.content ?? '';

  // Cache in DB for all records with this graphMessageId
  if (cached) {
    await prisma.email.updateMany({
      where: { graphMessageId: cached.graphMessageId },
      data: { bodyHtml },
    });
  }

  return NextResponse.json({
    subject: msg.subject,
    from: msg.from?.emailAddress?.name ?? msg.from?.emailAddress?.address,
    to: msg.toRecipients?.map((r: any) => r.emailAddress?.name ?? r.emailAddress?.address).join(', '),
    date: msg.receivedDateTime,
    bodyHtml,
  });
}

function parseRecipients(json: string): string {
  try {
    const arr = JSON.parse(json) as { name: string; address: string }[];
    return arr.map(r => r.name || r.address).join(', ');
  } catch {
    return '';
  }
}
