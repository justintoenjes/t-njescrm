import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// ── Delegated token (per-user, from session) ──

export async function getGraphToken(request: NextRequest): Promise<string | null> {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  return (token?.accessToken as string) ?? null;
}

// ── App-level token (Client Credentials Flow) ──

let appTokenCache: { token: string; expiresAt: number } | null = null;

export async function getAppToken(): Promise<string> {
  if (appTokenCache && Date.now() < appTokenCache.expiresAt - 60_000) {
    return appTokenCache.token;
  }

  const params = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID!,
    client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() },
  );

  const data = await res.json();
  if (!data.access_token) {
    throw new GraphTokenError(`App-Token konnte nicht abgerufen werden: ${data.error_description ?? data.error}`);
  }

  appTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function graphFetch(accessToken: string, path: string, options?: RequestInit) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message ?? `Graph API error ${res.status}`;
    if (res.status === 401) {
      throw new GraphTokenError('Microsoft-Token abgelaufen. Bitte neu anmelden.');
    }
    throw new GraphApiError(message, res.status);
  }

  // Some endpoints (sendMail) return 202 with no body
  if (res.status === 202 || res.status === 204) return null;
  return res.json();
}

export class GraphTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphTokenError';
  }
}

export class GraphApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GraphApiError';
    this.status = status;
  }
}

// ── Calendar ──

export interface CalendarEventInput {
  subject: string;
  start: Date;
  durationMinutes?: number;
  body?: string;
  reminderMinutes?: number;
  isAllDay?: boolean;
}

function buildEventPayload(input: CalendarEventInput) {
  const { subject, start, durationMinutes = 30, body, reminderMinutes = 15, isAllDay } = input;

  const payload: any = {
    subject,
    isReminderOn: reminderMinutes > 0,
    reminderMinutesBeforeStart: reminderMinutes > 0 ? reminderMinutes : 0,
  };

  if (isAllDay) {
    const dateStr = start.toISOString().split('T')[0];
    const nextDay = new Date(start.getTime() + 86400000).toISOString().split('T')[0];
    payload.isAllDay = true;
    payload.start = { dateTime: dateStr, timeZone: 'Europe/Berlin' };
    payload.end = { dateTime: nextDay, timeZone: 'Europe/Berlin' };
  } else {
    payload.start = { dateTime: start.toISOString(), timeZone: 'UTC' };
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    payload.end = { dateTime: end.toISOString(), timeZone: 'UTC' };
  }

  if (body) {
    // Convert newlines to <br> and linkify URLs for clickable links in Outlook
    const htmlBody = body
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
      .replace(/\n/g, '<br>');
    payload.body = { contentType: 'HTML', content: htmlBody };
  }

  return payload;
}

/** Create calendar event in a specific user's calendar (App Permission) */
export async function createCalendarEventForUser(userEmail: string, input: CalendarEventInput) {
  const appToken = await getAppToken();
  const payload = buildEventPayload(input);
  return graphFetch(appToken, `/users/${encodeURIComponent(userEmail)}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Delete calendar event from a specific user's calendar (App Permission) */
export async function deleteCalendarEventForUser(userEmail: string, eventId: string) {
  const appToken = await getAppToken();
  return graphFetch(appToken, `/users/${encodeURIComponent(userEmail)}/events/${eventId}`, {
    method: 'DELETE',
  });
}

/** Create calendar event in the logged-in user's calendar (Delegated) */
export async function createCalendarEvent(accessToken: string, input: CalendarEventInput) {
  const payload = buildEventPayload(input);
  return graphFetch(accessToken, '/me/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
