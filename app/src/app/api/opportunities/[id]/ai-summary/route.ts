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

  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      lead: { select: { firstName: true, lastName: true, companyRef: { select: { id: true, name: true } } } },
      notes: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role !== 'ADMIN' && opp.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (opp.notes.length === 0) return NextResponse.json({ error: 'Keine Notizen vorhanden' }, { status: 400 });

  const notesText = opp.notes
    .map((n, i) => `[${i + 1}] ${new Date(n.createdAt).toLocaleDateString('de-DE')}: ${n.content}`)
    .join('\n');

  const fullName = `${opp.lead.firstName} ${opp.lead.lastName}`.trim();
  const prompt = `Du bist ein CRM-Vertriebsassistent. Analysiere folgende Deal-Notizen für die Opportunity "${opp.title}" mit ${fullName}${opp.lead.companyRef?.name ? ` (${opp.lead.companyRef.name})` : ''} (Stage: ${opp.stage}).

Notizen:
${notesText}

Antworte mit einem validen JSON-Objekt:
{
  "summary": "3 Stichpunkte zum Deal-Verlauf, getrennt durch ' | '",
  "sentiment": "eines von: frustriert | skeptisch | neutral | interessiert | kaufbereit",
  "sentimentEmoji": "passendes Emoji",
  "sentimentExplanation": "kurze Begründung (1 Satz)",
  "sentimentScore": <Zahl 1-10, wobei 10 = sehr kaufbereit>,
  "nextAction": "konkrete Empfehlung für den nächsten Schritt",
  "temperatureSuggestion": <null | "warm" | "hot">,
  "temperatureSuggestionReason": <null | "Begründung">
}

Regeln für temperatureSuggestion: "hot" bei Kaufbereitschaft/Entscheidungsreife, "warm" bei klarem Need, sonst null.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    let result;
    try { result = JSON.parse(completion.choices[0].message.content ?? '{}'); }
    catch { return NextResponse.json({ error: 'KI-Antwort war kein gültiges JSON' }, { status: 502 }); }
    // Persist sentiment score
    if (result.sentimentScore != null) {
      await prisma.opportunity.update({
        where: { id },
        data: { aiSentimentScore: result.sentimentScore, aiSentimentAt: new Date() },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: `OpenAI-Fehler: ${msg}` }, { status: 500 });
  }
}
