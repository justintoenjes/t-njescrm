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
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY nicht konfiguriert' }, { status: 500 });

  const [opp, defaultFormal, subjectConfig] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id },
      include: {
        lead: {
          select: {
            name: true, email: true, formalAddress: true, category: true,
            companyRef: { select: { id: true, name: true } },
            emails: { orderBy: { receivedAt: 'desc' }, take: 10 },
          },
        },
        notes: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    }),
    prisma.globalConfig.findUnique({ where: { key: 'default_formal_address' } }),
    prisma.globalConfig.findUnique({ where: { key: 'followup_subject_template' } }),
  ]);
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Build unified timeline from opp notes + lead emails
  const activities: ActivityEntry[] = [];

  for (const note of opp.notes) {
    const isCall = CALL_PATTERN.test(note.content);
    activities.push({
      date: note.createdAt,
      label: isCall
        ? `📞 ${note.content.split('\n')[0]}`
        : `📝 Notiz: ${note.content.substring(0, 120)}`,
    });
  }

  for (const email of opp.lead.emails) {
    const dir = email.direction === 'INBOUND' ? 'Eingehende' : 'Ausgehende';
    activities.push({
      date: email.receivedAt,
      label: `✉️ ${dir} E-Mail: ${email.subject ?? '(kein Betreff)'}${email.bodyPreview ? ' — ' + email.bodyPreview.substring(0, 80) : ''}`,
    });
  }

  // Sort desc, take last 5
  activities.sort((a, b) => b.date.getTime() - a.date.getTime());
  const recentActivities = activities.slice(0, 5);

  const useFormal = opp.lead.formalAddress ?? (defaultFormal?.value === 'true');
  const addressStyle = useFormal
    ? 'Verwende die formelle Anrede (Sie/Ihnen/Ihr). Sieze den Empfänger konsequent.'
    : 'Verwende die informelle Anrede (du/dir/dein). Duze den Empfänger konsequent.';

  const isRecruiting = opp.lead.category === 'RECRUITING';
  const contextType = isRecruiting
    ? 'Dies ist ein Recruiting-Prozess. Der Tonfall sollte wertschätzend, kandidatenorientiert und einladend sein.'
    : 'Dies ist ein Sales-/Vertriebsprozess. Der Tonfall sollte professionell und lösungsorientiert sein.';

  const stageGuidance = isRecruiting
    ? `Tonalität nach Stage:
- SCREENING: Interesse wecken, Position vorstellen, Neugier erzeugen
- INTERVIEW: Vorbereitung, Wertschätzung zeigen, nächste Schritte klären
- OFFER: Begeisterung für Angebot, Vorteile hervorheben, Entscheidung unterstützen
- HIRED: Willkommen heißen, Onboarding-Infos, Vorfreude
- REJECTED: Wertschätzend absagen, Tür offen lassen`
    : `Tonalität nach Stage:
- PROPOSAL: Angebot im Fokus, Vorteile hervorheben
- NEGOTIATION: Einwände aufgreifen, Lösungen anbieten
- CLOSING: Entscheidung einfordern, Dringlichkeit erzeugen
- WON: Dankschreiben, nächste Schritte
- LOST: Tür offen lassen für Zukunft`;

  const prompt = `Du bist ein professioneller ${isRecruiting ? 'Recruiting-' : 'B2B-Vertriebs'}texter. Erstelle eine personalisierte Follow-Up E-Mail für folgende Opportunity.

${contextType}
${addressStyle}

Opportunity: ${opp.title}
Kontakt: ${opp.lead.name}${opp.lead.companyRef?.name ? ` (${opp.lead.companyRef.name})` : ''}
${opp.lead.email ? `E-Mail: ${opp.lead.email}` : ''}
Stage: ${opp.stage}
${opp.value ? `Deal-Wert: ${opp.value.toLocaleString('de-DE')} €` : ''}

Letzte Aktivitäten (chronologisch, neueste zuerst):
${buildActivityText(recentActivities)}

${stageGuidance}

Antworte mit einem validen JSON-Objekt:
{
  "subject": "E-Mail Betreff",
  "body": "E-Mail Text (\\n für Zeilenumbrüche, professionell aber persönlich, auf Deutsch, max. 150 Wörter)"
}

WICHTIG: Generiere KEINE Grußformel (kein "Mit freundlichen Grüßen", "Beste Grüße" etc.) und KEINE Signatur (kein Name, keine Firma, keine Kontaktdaten am Ende). Der Text endet nach dem inhaltlichen Teil. Grußformel und Signatur werden automatisch angehängt.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    let parsed;
    const rawText = completion.choices[0].message.content ?? '{}';
    try { parsed = JSON.parse(rawText); }
    catch { console.error('Follow-Up JSON parse error, raw:', rawText); return NextResponse.json({ error: 'KI-Antwort war kein gültiges JSON' }, { status: 502 }); }

    // Apply subject template if configured
    if (subjectConfig?.value) {
      const firma = opp.lead.companyRef?.name || '';
      parsed.subject = subjectConfig.value
        .replace(/\{\{NAME\}\}/g, opp.lead.name)
        .replace(/\{\{JOBTITEL\}\}/g, opp.title)
        .replace(/\{\{FIRMA\}\}/g, firma);
    }

    // Persist as AI-generated note
    const noteContent = `📧 **KI Follow-Up**\n**Betreff:** ${parsed.subject}\n\n${parsed.body}`;
    const note = await prisma.note.create({
      data: {
        content: noteContent,
        isAiGenerated: true,
        opportunityId: id,
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
