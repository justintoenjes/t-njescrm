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
  matchedPreview: string;
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

const OFFER_TERMS = /angebot|kostenvoranschlag|offerte|proposal|preisangebot|auftragsbestätigung|angebotserstellung/i;

// ── Newsletter / Automated sender detection ──

const NOREPLY_PATTERNS = [
  /^no-?reply/i, /^noreply/i, /^donotreply/i, /^bounce/i,
  /^newsletter/i, /^news@/i, /^digest/i,
  /^info@/i, /^service@/i, /^support@/i, /^office@/i,
  /^hello@/i, /^team@/i, /^marketing@/i, /^sales@/i,
  /^academy@/i, /^training[.@]/i, /^webinar/i,
  /^mailer-daemon/i, /^postmaster/i,
  /^notifications?@/i, /^alert/i, /^updates?@/i,
  /^guthaben@/i, /^keineantwort/i,
  /^groups-/i, /^mailrobot/i, /^robot@/i, /^automat/i,
  /^billing@/i, /^invoice@/i, /^rechnung@/i,
  /^careers@/i, /^jobs@/i, /^recruiting@/i,
];

const NEWSLETTER_DOMAINS = [
  // Social / Big Tech
  'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
  'google.com', 'youtube.com', 'apple.com', 'microsoft.com',
  // E-Commerce / Services
  'amazon.com', 'amazon.de', 'paypal.com', 'ebay.de', 'ebay.com',
  'check24.de', 'klarmobil.de', 'spendit.de',
  // Job portals / Recruiting platforms
  'xing.com', 'stepstone.de', 'indeed.com', 'monster.de',
  'freelancermap.de', 'gulp.de', 'randstad.de',
  // Dev / SaaS
  'github.com', 'notion.so', 'slack.com', 'atlassian.com',
  'figma.com', 'canva.com', 'zoom.us', 'dropbox.com',
];

function isAutomatedSender(email: string): boolean {
  const lower = email.toLowerCase();
  const localPart = lower.split('@')[0] ?? '';
  const domain = lower.split('@')[1] ?? '';

  // Check local part patterns
  if (NOREPLY_PATTERNS.some(p => p.test(localPart))) return true;

  // Check domain exact match
  if (NEWSLETTER_DOMAINS.includes(domain)) return true;

  // Check subdomains (e.g. mail.xing.com, news.evergabe.de, recruiting.stepstone.de)
  if (NEWSLETTER_DOMAINS.some(d => domain.endsWith('.' + d))) return true;

  // Heuristic: subdomain patterns that indicate automated mail
  const subParts = domain.split('.');
  if (subParts.length >= 3) {
    const sub = subParts[0];
    if (/^(mail|news|newsletter|marketing|noreply|notify|updates|campaigns|mailer|bulk|promo)$/.test(sub)) {
      return true;
    }
  }

  return false;
}

// ── Main handler ──

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
      if (!cursor.startsWith('https://graph.microsoft.com/')) {
        return NextResponse.json({ error: 'Ungültiger Cursor' }, { status: 400 });
      }
      graphUrl = cursor;
    } else {
      // ALWAYS use $filter for dates (works reliably), never $search
      // For offers/both: keyword matching is done server-side on subject+bodyPreview
      graphUrl = buildGraphUrl(dateFrom, dateTo);
    }

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

    // Filter: external senders only, no newsletters
    const externalMessages = messages.filter((msg: any) => {
      const fromEmail = msg.from?.emailAddress?.address?.toLowerCase() ?? '';
      if (!fromEmail || fromEmail === ownEmail) return false;
      if (ownDomain && fromEmail.endsWith(`@${ownDomain}`)) return false;
      if (isAutomatedSender(fromEmail)) return false;
      return true;
    });

    // For offers/both mode: also filter to only emails mentioning offer terms
    const relevantMessages = (mode === 'offers' || mode === 'both')
      ? externalMessages.filter((msg: any) => {
          const subject = msg.subject ?? '';
          const preview = msg.bodyPreview ?? '';
          return OFFER_TERMS.test(subject) || OFFER_TERMS.test(preview);
        })
      : externalMessages;

    // Fetch full bodies via $batch for signature parsing
    const needBodies = mode !== 'offers';
    let bodiesMap: Map<string, string> = new Map();

    if (needBodies && relevantMessages.length > 0) {
      bodiesMap = await fetchBodies(relevantMessages.map((m: any) => m.id), accessToken);
    }

    // Extract contacts
    const contactMap = new Map<string, ScannedContact>();

    for (const msg of relevantMessages) {
      const fromAddr = msg.from?.emailAddress?.address ?? '';
      const fromName = msg.from?.emailAddress?.name ?? fromAddr.split('@')[0];
      const email = fromAddr.toLowerCase();

      if (contactMap.has(email)) continue;

      const { firstName, lastName } = splitName(fromName);
      const subject = msg.subject ?? '';
      const date = msg.receivedDateTime ?? '';

      let phone: string | null = null;
      let company: string | null = null;
      let title: string | null = null;
      let confidence = 0;
      let source: 'signature' | 'offer' = 'signature';

      // Parse signature from body
      const htmlBody = bodiesMap.get(msg.id) ?? msg.bodyPreview ?? '';
      const sig = parseSignature(htmlBody);
      phone = sig.phone;
      company = sig.company;
      title = sig.title;
      confidence = sig.confidence;

      // Filter out own company from parsed results
      if (company && ownDomain) {
        const ownCompanyHint = ownDomain.split('.')[0]; // e.g. "toenjes-consulting" from domain
        if (company.toLowerCase().includes(ownCompanyHint.toLowerCase()) && ownCompanyHint.length >= 4) {
          company = null;
          title = null; // likely also from own signature
          confidence = Math.max(0, confidence - 0.35);
        }
      }

      // Boost confidence for offer matches
      if (mode === 'offers' || mode === 'both') {
        if (OFFER_TERMS.test(subject)) {
          source = 'offer';
          confidence = Math.min(1, confidence + 0.3);
        } else if (OFFER_TERMS.test(msg.bodyPreview ?? '')) {
          source = 'offer';
          confidence = Math.min(1, confidence + 0.15);
        }
      }

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
        matchedPreview: (msg.bodyPreview ?? '').substring(0, 300),
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

/**
 * Build Graph URL — always uses $filter + $orderby (no $search).
 * Keyword matching for offers is done server-side.
 */
function buildGraphUrl(dateFrom?: string, dateTo?: string): string {
  const select = '$select=id,subject,from,receivedDateTime,bodyPreview';
  const top = '$top=100'; // fetch more since we filter server-side
  const order = '$orderby=receivedDateTime desc';

  const filters: string[] = [];
  if (dateFrom) filters.push(`receivedDateTime ge ${dateFrom}T00:00:00Z`);
  if (dateTo) filters.push(`receivedDateTime le ${dateTo}T23:59:59Z`);
  const filter = filters.length > 0 ? `$filter=${filters.join(' and ')}` : '';

  const params = [select, top, order, filter].filter(Boolean).join('&');
  return `https://graph.microsoft.com/v1.0/me/messages?${params}`;
}

/**
 * Fetch full email bodies via Graph $batch API.
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
