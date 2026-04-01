import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.accessToken) {
    return NextResponse.json({ contacts: [] });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';

  // Get recent emails, extract unique external senders
  const filter = search
    ? `$search="${encodeURIComponent(search)}"&`
    : '';
  const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?${filter}$select=from,receivedDateTime&$orderby=receivedDateTime desc&$top=100`;

  try {
    const res = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (!res.ok) return NextResponse.json({ contacts: [] });

    const data = await res.json();
    const messages = data.value ?? [];

    // Extract unique contacts by email
    const seen = new Set<string>();
    const contacts: { name: string; email: string; date: string }[] = [];

    // Get existing lead emails to mark them
    const existingLeads = await prisma.lead.findMany({
      where: { email: { not: null } },
      select: { email: true },
    });
    const existingEmails = new Set(existingLeads.map(l => l.email!.toLowerCase()));

    // Get own email domain to filter out internal
    const ownEmail = session.user.email ?? '';
    const ownDomain = ownEmail.split('@')[1] ?? '';

    for (const msg of messages) {
      const from = msg.from?.emailAddress;
      if (!from?.address) continue;

      const email = from.address.toLowerCase();
      // Skip own emails and already-seen
      if (seen.has(email)) continue;
      if (email === ownEmail.toLowerCase()) continue;
      // Skip internal domain emails
      if (ownDomain && email.endsWith(`@${ownDomain}`)) continue;
      // Skip already existing leads
      if (existingEmails.has(email)) continue;

      seen.add(email);
      contacts.push({
        name: from.name ?? email.split('@')[0],
        email: from.address,
        date: msg.receivedDateTime,
      });

      if (contacts.length >= 20) break;
    }

    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ contacts: [] });
  }
}
