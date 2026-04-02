import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { openai, MODEL } from '@/lib/openai';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY nicht konfiguriert' }, { status: 500 });

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { companyRef: { select: { id: true, name: true } }, notes: { where: { leadId: id }, orderBy: { createdAt: 'asc' } } },
  });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && lead.assignedToId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (lead.notes.length === 0) return NextResponse.json({ error: 'Keine Notizen vorhanden' }, { status: 400 });

  const notesText = lead.notes
    .map((n, i) => `[${i + 1}] ${new Date(n.createdAt).toLocaleDateString('de-DE')}: ${n.content}`)
    .join('\n');

  const fullName = `${lead.firstName} ${lead.lastName}`.trim();
  const prompt = `Du bist ein CRM-Vertriebsassistent. Analysiere folgende Kontaktnotizen für den Lead "${fullName}"${lead.companyRef?.name ? ` (${lead.companyRef.name})` : ''}.

Notizen (Kontakthistorie):
${notesText}

Antworte mit einem validen JSON-Objekt:
{
  "summary": "3 Stichpunkte zum Kontaktverlauf, getrennt durch ' | '",
  "sentiment": "eines von: frustriert | skeptisch | neutral | interessiert | kaufbereit",
  "sentimentEmoji": "passendes Emoji",
  "sentimentExplanation": "kurze Begründung (1 Satz)",
  "sentimentScore": <Zahl 1-10>,
  "nextAction": "konkrete Empfehlung für den nächsten Schritt"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    let parsed;
    try { parsed = JSON.parse(completion.choices[0].message.content ?? '{}'); }
    catch { return NextResponse.json({ error: 'KI-Antwort war kein gültiges JSON' }, { status: 502 }); }

    // Persist sentiment score for lead scoring
    if (typeof parsed.sentimentScore === 'number') {
      await prisma.lead.update({
        where: { id },
        data: {
          aiSentimentScore: parsed.sentimentScore,
          aiSentimentAt: new Date(),
        },
      });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: `OpenAI-Fehler: ${msg}` }, { status: 500 });
  }
}
