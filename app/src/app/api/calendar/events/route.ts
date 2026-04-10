import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { getGraphToken, createCalendarEvent, GraphTokenError, GraphApiError } from '@/lib/microsoft-graph';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = await getGraphToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Keine Microsoft-Verbindung. Bitte mit Microsoft anmelden.' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }

  const { subject, start, durationMinutes, body: eventBody, reminderMinutes, isAllDay } = body as {
    subject: string;
    start: string;
    durationMinutes?: number;
    body?: string;
    reminderMinutes?: number;
    isAllDay?: boolean;
  };

  if (!subject || !start) {
    return NextResponse.json({ error: 'subject und start erforderlich' }, { status: 400 });
  }

  try {
    const event = await createCalendarEvent(accessToken, {
      subject,
      start: new Date(start),
      durationMinutes,
      body: eventBody,
      reminderMinutes: reminderMinutes ?? 15,
      isAllDay,
    });

    return NextResponse.json({ ok: true, eventId: event?.id ?? null }, { status: 201 });
  } catch (e) {
    if (e instanceof GraphTokenError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    if (e instanceof GraphApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Kalenderevent konnte nicht erstellt werden' }, { status: 502 });
  }
}
