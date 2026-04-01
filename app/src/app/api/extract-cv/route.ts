import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
// @ts-expect-error pdf-parse has no types
import pdf from 'pdf-parse';

/** Section headers / labels that are NOT names */
const SKIP_WORDS = new Set([
  'lebenslauf', 'curriculum', 'vitae', 'cv', 'bewerbung', 'resume',
  'persönliche', 'daten', 'kontakt', 'anschrift', 'adresse',
  'seite', 'page', 'profil', 'zur', 'person', 'berufserfahrung',
  'ausbildung', 'kenntnisse', 'sprachen', 'hobbys', 'interessen',
  'telefon', 'email', 'e-mail', 'mobil', 'tel', 'fax', 'geboren',
  'geburtsdatum', 'nationalität', 'familienstand', 'straße', 'str',
  'beruf', 'position', 'titel', 'betreff', 'anhang', 'referenzen',
  'qualifikationen', 'weiterbildung', 'werdegang', 'über', 'mich',
  'zusammenfassung', 'summary', 'objective', 'personal', 'details',
]);

/** Suffixes/words typical for German job titles, NOT person names */
const JOB_TITLE_PATTERNS = [
  // Suffixes: -kraft, -in (Beruf), -er (Beruf), -ent, -ant, -ist, -eur, -iker, -oge
  /kraft$/i, /pfleger(in)?$/i, /schwester$/i, /arzt$/i, /ärztin$/i,
  /meister(in)?$/i, /techniker(in)?$/i, /ingenieur(in)?$/i,
  /kaufmann$/i, /kauffrau$/i, /berater(in)?$/i, /leiter(in)?$/i,
  /manager(in)?$/i, /direktor(in)?$/i, /assistent(in)?$/i,
  /sekretär(in)?$/i, /referent(in)?$/i, /koordinator(in)?$/i,
  /entwickler(in)?$/i, /designer(in)?$/i, /analyst(in)?$/i,
  /spezialist(in)?$/i, /fachkraft$/i, /hilfskraft$/i, /aushilfe$/i,
  /praktikant(in)?$/i, /azubi$/i, /auszubildende[r]?$/i,
  /consultant$/i, /controller(in)?$/i, /disponentin?$/i,
  /sachbearbeiter(in)?$/i, /mitarbeiter(in)?$/i, /angestellte[r]?$/i,
  /fachangestellte[r]?$/i, /wissenschaftliche[r]?$/i,
  /student(in)?$/i, /absolvent(in)?$/i, /trainee$/i,
];

/** Full words that indicate a job title context */
const JOB_CONTEXT_WORDS = new Set([
  'medizinische', 'medizinischer', 'technische', 'technischer',
  'kaufmännische', 'kaufmännischer', 'leitende', 'leitender',
  'stellvertretende', 'stellvertretender', 'senior', 'junior',
  'werkstudent', 'freiberufliche', 'freiberuflicher', 'selbständige',
  'examinierte', 'examinierter', 'gelernte', 'gelernter',
  'staatlich', 'geprüfte', 'geprüfter', 'zertifizierte', 'zertifizierter',
]);

function isLikelyJobTitle(line: string): boolean {
  const lower = line.toLowerCase();
  const words = lower.split(/\s+/);

  // Any word matches a job title suffix pattern?
  for (const word of words) {
    for (const pattern of JOB_TITLE_PATTERNS) {
      if (pattern.test(word)) return true;
    }
  }

  // Contains a job context word?
  for (const word of words) {
    if (JOB_CONTEXT_WORDS.has(word)) return true;
  }

  return false;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractPhone(text: string): string | null {
  const patterns = [
    /(?:\+49|0049)[\s\-./]*\d[\s\-./\d]{7,14}/,
    /0\d{2,4}[\s\-./]\d[\s\-./\d]{5,12}/,
    /\(0\d{2,4}\)[\s\-./]*\d[\s\-./\d]{5,12}/,
    /01[5-7]\d[\s\-./]*\d[\s\-./\d]{6,10}/,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[0].replace(/[\s]/g, '').replace(/\//g, ' / ');
  }
  return null;
}

function extractName(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Strategy 1: Look for explicit "Name: Vorname Nachname" labels
  for (const line of lines.slice(0, 40)) {
    const labelMatch = line.match(/^(?:name|vor-?\s*(?:und\s+)?nachname|vollständiger\s+name)\s*[:]\s*(.+)/i);
    if (labelMatch) {
      const val = labelMatch[1].trim();
      if (val.split(/\s+/).length >= 2 && !isLikelyJobTitle(val)) return val;
    }
  }

  // Strategy 2: First plausible name-like line (before any section header)
  let passedSectionHeader = false;
  for (const line of lines.slice(0, 40)) {
    const lower = line.toLowerCase();

    // Track if we've passed a section header like "Berufserfahrung", "Ausbildung"
    if (/^(berufserfahrung|ausbildung|beruflicher|werdegang|qualifikation|kenntnisse|profil)/i.test(lower)) {
      passedSectionHeader = true;
    }
    // Stop looking after section headers — name should be before them
    if (passedSectionHeader) break;

    // Skip known section headers / labels
    if (SKIP_WORDS.has(lower)) continue;
    if (lower.split(/\s+/).every(w => SKIP_WORDS.has(w))) continue;

    // Skip lines with email, phone, URL, dates
    if (/@/.test(line) || /https?:/.test(line)) continue;
    if (/^\+?\d[\d\s\-./()]{6,}$/.test(line)) continue;
    if (/^\d{2}[./]\d{2}[./]\d{2,4}/.test(line)) continue;

    // Skip job titles
    if (isLikelyJobTitle(line)) continue;

    // Skip lines that are too long (sentence) or too short
    if (line.length > 40 || line.length < 3) continue;

    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;

    // Most words should start with uppercase
    const upperWords = words.filter(w => /^[A-ZÄÖÜ]/.test(w));
    if (upperWords.length >= 2) {
      return line;
    }
  }

  return null;
}

/** Converts "HANS MÜLLER" or "hans müller" to "Hans Müller" */
function toTitleCase(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 });

  const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
  const isEml = file.type === 'message/rfc822' || file.name.endsWith('.eml');
  const isMsg = file.name.endsWith('.msg');

  if (!isPdf && !isEml && !isMsg) {
    return NextResponse.json({ error: 'Nur PDF oder E-Mail Dateien (.eml)' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isPdf) {
      const data = await pdf(buffer);
      const text: string = data.text;
      const debugLines = text.split('\n').map((l: string) => l.trim()).filter(Boolean).slice(0, 30);
      const rawName = extractName(text);

      return NextResponse.json({
        name: rawName ? toTitleCase(rawName) : null,
        email: extractEmail(text),
        phone: extractPhone(text),
      });
    }

    // Parse .eml file (RFC 822 format)
    const emlText = buffer.toString('utf-8');
    const fromHeader = emlText.match(/^From:\s*(.+)$/mi);
    let emlName: string | null = null;
    let emlEmail: string | null = null;

    if (fromHeader) {
      const fromValue = fromHeader[1].trim();
      // Format: "Name" <email@example.com> or Name <email@example.com> or just email@example.com
      const namedMatch = fromValue.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
      if (namedMatch) {
        emlName = namedMatch[1].trim();
        emlEmail = namedMatch[2].trim();
      } else {
        emlEmail = extractEmail(fromValue);
        emlName = emlEmail?.split('@')[0] ?? null;
      }
    }

    // Also try to find phone in email body
    const emlPhone = extractPhone(emlText);

    return NextResponse.json({
      name: emlName ? toTitleCase(emlName) : null,
      email: emlEmail,
      phone: emlPhone,
    });
  } catch {
    return NextResponse.json({ error: 'Datei konnte nicht gelesen werden' }, { status: 422 });
  }
}
