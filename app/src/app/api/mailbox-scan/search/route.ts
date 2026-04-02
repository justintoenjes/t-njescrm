import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';
import { parseSignature, splitName } from '@/lib/signature-parser';

export type ScannedContact = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  source: 'signature' | 'offer';
  matchedSubject: string;
  matchedDate: string;
  confidence: number;
  isDuplicate: boolean;
  existingLeadId?: string;
};

type SearchRequest = {
  mode: 'signatures' | 'offers' | 'both';
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
};

const OFFER_KEYWORDS = 'Angebot OR Kostenvoranschlag OR Offerte OR Proposal OR Preisangebot OR Auftragsbestätigung OR Angebotserstellung';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.accessToken) {
    return NextResponse.json({ error: 'Keine Microsoft-Verbindung. Bitte mit Microsoft anmelden.' }, { status: 403 });
  }

  let body: SearchRequest;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }

  const { mode, dateFrom, dateTo, cursor } = body;
  const accessToken = token.accessToken as string;
  const ownEmail = (session.user.email ?? '').toLowerCase();
  const ownDomain = ownEmail.split('@')[1] ?? '';

  try {
    let graphUrl: string;

    if (cursor) {
      // Validate cursor URL
      if (!cursor.startsWith('https://graph.microsoft.com/')) {
        return NextResponse.json({ error: 'Ungültiger Cursor' }, { status: 400 });
      }
      graphUrl = cursor;
    } else {
      graphUrl = buildGraphUrl(mode, dateFrom, dateTo);
    }

    // Fetch messages from Graph
    const res = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        return NextResponse.json({ error: 'Microsoft-Token abgelaufen. Bitte neu anmelden.' }, { status: 401 });
      }
      if (res.status === 429) {
        return NextResponse.json({ error: 'Zu viele Anfragen. Bitte kurz warten.' }, { status: 429 });
      }
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody?.error?.message ?? `Graph API Fehler (${res.status})`;
      console.error('Graph API error:', res.status, errMsg);
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    const data = await res.json();
    const messages: any[] = data.value ?? [];
    const nextCursor: string | null = data['@odata.nextLink'] ?? null;

    // Filter external senders
    const externalMessages = messages.filter((msg: any) => {
      const fromEmail = msg.from?.emailAddress?.address?.toLowerCase() ?? '';
      if (!fromEmail || fromEmail === ownEmail) return false;
      if (ownDomain && fromEmail.endsWith(`@${ownDomain}`)) return false;
      return true;
    });

    // Fetch full bodies via $batch for signature parsing
    const needBodies = mode !== 'offers'; // signatures or both
    let bodiesMap: Map<string, string> = new Map();

    if (needBodies && externalMessages.length > 0) {
      bodiesMap = await fetchBodies(externalMessages.map((m: any) => m.id), accessToken);
    }

    // Extract contacts
    const contactMap = new Map<string, ScannedContact>();

    for (const msg of externalMessages) {
      const fromAddr = msg.from?.emailAddress?.address ?? '';
      const fromName = msg.from?.emailAddress?.name ?? fromAddr.split('@')[0];
      const email = fromAddr.toLowerCase();

      if (contactMap.has(email)) continue; // already found

      const { firstName, lastName } = splitName(fromName);
      const subject = msg.subject ?? '';
      const date = msg.receivedDateTime ?? '';

      let phone: string | null = null;
      let company: string | null = null;
      let title: string | null = null;
      let confidence = 0;
      let source: 'signature' | 'offer' = 'signature';

      if (mode === 'offers') {
        // Offer mode: we know it's an offer email, use bodyPreview for basic info
        source = 'offer';
        confidence = 0.4; // offer keyword match gives base confidence
        const preview = msg.bodyPreview ?? '';
        const sig = parseSignature(preview);
        phone = sig.phone;
        company = sig.company;
        title = sig.title;
        confidence += sig.confidence * 0.6;
      } else {
        // Signature mode or both: parse full body
        const htmlBody = bodiesMap.get(msg.id) ?? msg.bodyPreview ?? '';
        const sig = parseSignature(htmlBody);
        phone = sig.phone;
        company = sig.company;
        title = sig.title;
        confidence = sig.confidence;

        // In "both" mode, boost confidence if subject matches offer keywords
        if (mode === 'both' && isOfferSubject(subject)) {
          source = 'offer';
          confidence = Math.min(1, confidence + 0.2);
        }
      }

      // Only include contacts with sufficient confidence
      if (confidence < 0.3) continue;

      contactMap.set(email, {
        email: fromAddr,
        firstName,
        lastName,
        phone,
        company,
        title,
        source,
        matchedSubject: subject,
        matchedDate: date,
        confidence,
        isDuplicate: false,
      });
    }

    // Check duplicates against existing leads
    const emails = Array.from(contactMap.keys());
    if (emails.length > 0) {
      const existing = await prisma.lead.findMany({
        where: { email: { in: emails, mode: 'insensitive' }, archived: false },
        select: { id: true, email: true },
      });
      for (const lead of existing) {
        const key = lead.email!.toLowerCase();
        const contact = contactMap.get(key);
        if (contact) {
          contact.isDuplicate = true;
          contact.existingLeadId = lead.id;
        }
      }
    }

    // Sort by confidence desc
    const contacts = Array.from(contactMap.values())
      .sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json({
      contacts,
      nextCursor,
      totalScanned: messages.length,
    });
  } catch (err) {
    console.error('Mailbox scan error:', err);
    return NextResponse.json({ error: 'Fehler beim Postfach-Scan' }, { status: 500 });
  }
}

function buildGraphUrl(mode: string, dateFrom?: string, dateTo?: string): string {
  const select = '$select=id,subject,from,receivedDateTime,bodyPreview';
  const top = '$top=50';

  const useSearch = mode === 'offers' || mode === 'both';

  if (useSearch) {
    // When using $search, $orderby and $filter on receivedDateTime are NOT allowed.
    // Date filtering is done via KQL syntax inside $search instead.
    let kql = OFFER_KEYWORDS;
    if (dateFrom) kql += ` AND received>=${dateFrom}`;
    if (dateTo) kql += ` AND received<=${dateTo}`;
    const search = `$search="${kql}"`;
    const params = [select, top, search].filter(Boolean).join('&');
    return `https://graph.microsoft.com/v1.0/me/messages?${params}`;
  }

  // Signatures mode: no $search, so $orderby and $filter work fine
  const order = '$orderby=receivedDateTime desc';
  const filters: string[] = [];
  if (dateFrom) filters.push(`receivedDateTime ge ${dateFrom}T00:00:00Z`);
  if (dateTo) filters.push(`receivedDateTime le ${dateTo}T23:59:59Z`);
  const filter = filters.length > 0 ? `$filter=${filters.join(' and ')}` : '';

  const params = [select, top, order, filter].filter(Boolean).join('&');
  return `https://graph.microsoft.com/v1.0/me/messages?${params}`;
}

function isOfferSubject(subject: string): boolean {
  return /angebot|kostenvoranschlag|offerte|proposal|preisangebot|auftragsbestätigung/i.test(subject);
}

/**
 * Fetch full email bodies via Graph $batch API.
 * Returns a map of messageId → body HTML content.
 */
async function fetchBodies(messageIds: string[], accessToken: string): Promise<Map<string, string>> {
  const bodiesMap = new Map<string, string>();
  const BATCH_SIZE = 20;

  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    const batch = messageIds.slice(i, i + BATCH_SIZE);
    const requests = batch.map((id, idx) => ({
      id: String(idx),
      method: 'GET',
      url: `/me/messages/${id}?$select=id,body`,
    }));

    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/$batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      });

      if (res.ok) {
        const data = await res.json();
        for (const response of data.responses ?? []) {
          if (response.status === 200 && response.body?.body?.content) {
            bodiesMap.set(response.body.id, response.body.body.content);
          }
        }
      }
    } catch {
      // Continue without bodies for this batch
    }
  }

  return bodiesMap;
}
