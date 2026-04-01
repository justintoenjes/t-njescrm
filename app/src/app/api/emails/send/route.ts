import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.accessToken) {
    return NextResponse.json({ error: 'Keine Microsoft-Verbindung. Bitte mit Microsoft anmelden.' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { to, subject, bodyText } = body as { to: string; subject: string; bodyText: string };

  if (!to || !subject || !bodyText) {
    return NextResponse.json({ error: 'to, subject und bodyText erforderlich' }, { status: 400 });
  }

  // Get user's signature and legal disclaimer
  const [user, legalConfig] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailSignature: true, name: true },
    }),
    prisma.globalConfig.findUnique({ where: { key: 'email_legal_disclaimer' } }),
  ]);

  const signature = user?.emailSignature?.trim();
  const disclaimer = legalConfig?.value?.trim();
  let fullBody = bodyText;
  if (signature) fullBody += `\n\n${signature}`;
  if (disclaimer) fullBody += `\n\n${disclaimer}`;

  // Escape HTML entities to prevent XSS
  const escapeHtml = (text: string) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Linkify URLs: extract URLs before escaping, then reassemble
  function processLine(line: string): string {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    const parts: string[] = [];
    let lastIdx = 0;
    let match;
    while ((match = urlRegex.exec(line)) !== null) {
      if (match.index > lastIdx) parts.push(escapeHtml(line.slice(lastIdx, match.index)));
      const url = match[1];
      parts.push(`<a href="${escapeHtml(url)}" style="color: #0078D4;">${escapeHtml(url)}</a>`);
      lastIdx = urlRegex.lastIndex;
    }
    if (lastIdx < line.length) parts.push(escapeHtml(line.slice(lastIdx)));
    return parts.join('');
  }

  const htmlBody = fullBody.split('\n').map(line => line.trim() === '' ? '' : processLine(line)).join('<br>');

  const mailPayload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: htmlBody },
      toRecipients: [{ emailAddress: { address: to } }],
    },
  };

  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mailPayload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) {
        return NextResponse.json({ error: 'Microsoft-Token abgelaufen. Bitte neu anmelden.' }, { status: 401 });
      }
      return NextResponse.json({ error: err?.error?.message ?? `Fehler ${res.status}` }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Verbindung zu Microsoft fehlgeschlagen' }, { status: 502 });
  }
}
