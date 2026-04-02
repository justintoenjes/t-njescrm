import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { openai, MODEL } from '@/lib/openai';

type Ctx = { params: Promise<{ id: string }> };

const CALL_PATTERN = /^(Eingehender|Ausgehender) Anruf/;

type ActivityEntry = { date: Date; label: string };

function buildActivityText(activities: ActivityEntry[]): string {
  if (activities.length === 0) return '(Keine bisherigen Aktivitäten)';
  return activities
    .map((a, i) => `[${i + 1}] ${a.date.toLocaleDateString('de-DE')}: ${a.label}`)
    .join('\n');
}

export async function POST(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY nicht konfiguriert' }, { status: 500 });
  }

  const [lead, defaultFormal, subjectConfig] = await Promise.all([
    prisma.lead.findUnique({
      where: { id },
      include: {
        companyRef: { select: { id: true, name: true } },
        notes: { orderBy: { createdAt: 'desc' }, take: 20 },
        emails: { orderBy: { receivedAt: 'desc' }, take: 20 },
        opportunities: {
          where: { stage: { notIn: ['WON', 'LOST', 'HIRED', 'REJECTED'] } },
          select: {
            id: true, title: true, stage: true, value: true,
            notes: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        },
      },
    }),
    prisma.globalConfig.findUnique({ where: { key: 'default_formal_address' } }),
    prisma.globalConfig.findUnique({ where: { key: 'followup_subject_template' } }),
  ]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && lead.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Build unified timeline from lead notes + emails + opp notes
  const activities: ActivityEntry[] = [];

  for (const note of lead.notes) {
    const isCall = CALL_PATTERN.test(note.content);
    activities.push({
      date: note.createdAt,
      label: isCall
        ? `📞 ${note.content.split('\n')[0]}`
        : `📝 Notiz: ${note.content.substring(0, 120)}`,
    });
  }

  for (const email of lead.emails) {
    const dir = email.direction === 'INBOUND' ? 'Eingehende' : 'Ausgehende';
    activities.push({
      date: email.receivedAt,
      label: `✉️ ${dir} E-Mail: ${email.subject ?? '(kein Betreff)'}${email.bodyPreview ? ' — ' + email.bodyPreview.substring(0, 80) : ''}`,
    });
  }

  for (const opp of lead.opportunities) {
    for (const note of opp.notes) {
      if (CALL_PATTERN.test(note.content)) continue; // already captured via lead notes
      activities.push({
        date: note.createdAt,
        label: `📝 [Opp: ${opp.title}] ${note.content.substring(0, 100)}`,
      });
    }
  }

  // Sort desc, take last 5
  activities.sort((a, b) => b.date.getTime() - a.date.getTime());
  const recentActivities = activities.slice(0, 5);

  // Build opportunities context
  const oppsContext = lead.opportunities.length > 0
    ? lead.opportunities.map(o =>
        `- ${o.title} (${o.stage}${o.value ? `, ${o.value.toLocaleString('de-DE')} €` : ''})`
      ).join('\n')
    : '(Keine offenen Opportunities)';

  const fullName = `${lead.firstName} ${lead.lastName}`.trim();
  const useFormal = lead.formalAddress ?? (defaultFormal?.value === 'true');
  const addressName = useFormal ? lead.lastName : lead.firstName;
  const addressStyle = useFormal
    ? `Verwende die formelle Anrede (Sie/Ihnen/Ihr). Sieze den Empfänger konsequent. Sprich den Kontakt mit Nachname an (z.B. "Herr/Frau ${lead.lastName}").`
    : `Verwende die informelle Anrede (du/dir/dein). Duze den Empfänger konsequent. Sprich den Kontakt mit Vorname an (z.B. "Hallo ${lead.firstName}").`;

  const isRecruiting = lead.category === 'RECRUITING';
  const contextType = isRecruiting
    ? 'Dies ist ein Recruiting-Kontakt. Der Tonfall sollte wertschätzend und kandidatenorientiert sein.'
    : 'Dies ist ein Vertriebskontakt (Sales). Der Tonfall sollte professionell und lösungsorientiert sein.';

  const prompt = `Du bist ein professioneller ${isRecruiting ? 'Recruiting-' : 'B2B-Vertriebs'}texter. Erstelle eine personalisierte Follow-Up E-Mail für folgenden Kontakt.

${contextType}
${addressStyle}

Kontakt: ${fullName}${lead.companyRef?.name ? ` (${lead.companyRef.name})` : ''}
${lead.email ? `E-Mail: ${lead.email}` : ''}
Kategorie: ${isRecruiting ? 'Recruiting' : 'Vertrieb/Sales'}

Aktuelle Opportunities:
${oppsContext}

Letzte Aktivitäten (chronologisch, neueste zuerst):
${buildActivityText(recentActivities)}

Antworte ausschließlich mit einem validen JSON-Objekt:
{
  "subject": "E-Mail Betreff",
  "body": "E-Mail Text (verwende \\n für Zeilenumbrüche, professionell aber persönlich, auf Deutsch, max. 150 Wörter)"
}

WICHTIG: Generiere KEINE Grußformel (kein "Mit freundlichen Grüßen", "Beste Grüße" etc.) und KEINE Signatur (kein Name, keine Firma, keine Kontaktdaten am Ende). Der Text endet nach dem inhaltlichen Teil. Grußformel und Signatur werden automatisch angehängt.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const text = completion.choices[0].message.content ?? '{}';
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { console.error('Follow-Up JSON parse error, raw:', text); return NextResponse.json({ error: 'KI-Antwort war kein gültiges JSON' }, { status: 502 }); }

    // Apply subject template if configured
    if (subjectConfig?.value) {
      const firma = lead.companyRef?.name || '';
      const oppTitle = lead.opportunities[0]?.title ?? '';
      parsed.subject = subjectConfig.value
        .replace(/\{\{NAME\}\}/g, fullName)
        .replace(/\{\{VORNAME\}\}/g, lead.firstName)
        .replace(/\{\{NACHNAME\}\}/g, lead.lastName)
        .replace(/\{\{JOBTITEL\}\}/g, oppTitle)
        .replace(/\{\{FIRMA\}\}/g, firma);
    }

    // Persist as AI-generated note
    const noteContent = `📧 **KI Follow-Up**\n**Betreff:** ${parsed.subject}\n\n${parsed.body}`;
    const note = await prisma.note.create({
      data: {
        content: noteContent,
        isAiGenerated: true,
        leadId: id,
        authorId: session.user.id,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ ...parsed, note });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: `OpenAI-Fehler: ${msg}` }, { status: 500 });
  }
}
