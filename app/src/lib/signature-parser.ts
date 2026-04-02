/**
 * Parses email signatures from HTML email bodies.
 * Extracts phone numbers, company names, and job titles.
 */

export type ParsedSignature = {
  phone: string | null;
  company: string | null;
  title: string | null;
  confidence: number; // 0–1
};

// Signature delimiters (German + English)
const SIGNATURE_DELIMITERS = [
  /mit\s+freundlichen\s+gr[üu](?:ß|ss)en/i,
  /freundliche\s+gr[üu](?:ß|ss)e/i,
  /beste\s+gr[üu](?:ß|ss)e/i,
  /viele\s+gr[üu](?:ß|ss)e/i,
  /herzliche\s+gr[üu](?:ß|ss)e/i,
  /liebe\s+gr[üu](?:ß|ss)e/i,
  /kind\s+regards/i,
  /best\s+regards/i,
  /regards,?\s*$/im,
  /^--\s*$/m,
];

// Phone patterns (German)
const PHONE_PATTERNS = [
  // Labeled: Tel: +49 123 456, Mobil: 0171/1234567, etc.
  /(?:Tel(?:efon)?|Fon|Phone|Mobil(?:e)?|Fax|Handy)[.:\s]*(\+?\d[\d\s\-\/().]{5,18}\d)/i,
  // Standalone +49 or 0-prefixed numbers with enough digits
  /(\+49[\d\s\-\/().]{6,18}\d)/,
  /(0\d{2,4}[\s\-\/.]?\d{3,}[\d\s\-\/.]*\d)/,
];

// German legal form suffixes for company detection
// Require at least one proper word (3+ chars) before the suffix to avoid false positives like "se", "kg"
const COMPANY_PATTERN = /(?:[\w\u00C0-\u024F&.\-]{3,}[\w\u00C0-\u024F&.\-\s]{0,37}\s+)(?:GmbH\s*&\s*Co\.?\s*KG(?:aA)?|GmbH|mbH|AG|KG(?:aA)?|e\.?\s?K\.|GbR|OHG|UG|SE|Inc\.|Ltd\.?|LLC|S\.?A\.?)\b/gi;

// Job title patterns (German + English)
const TITLE_PATTERNS = [
  /(?:Gesch[äa]ftsf[üu]hrer(?:in)?|Inhaber(?:in)?|Prokurist(?:in)?|Vorstand|Vorst[äa]ndin)/i,
  /(?:Geschäftsleitung|Betriebsleitung)/i,
  /(?:(?:Abteilungs|Vertriebs|Projekt|Team|Bereichs|Niederlassungs|Regional)leiter(?:in)?)/i,
  /(?:(?:Senior|Junior|Lead|Head\s+of|Director|Direktor(?:in)?)\s+[\w\s&\-/]{2,30})/i,
  /(?:CEO|CTO|CFO|COO|CMO|CIO|CPO|CHRO|VP|SVP|EVP)\b/i,
  /(?:Manager(?:in)?|Consultant|Berater(?:in)?|Referent(?:in)?|Koordinator(?:in)?|Sachbearbeiter(?:in)?)\b/i,
  /(?:Partner(?:in)?|Associate|Analyst(?:in)?|Architekt(?:in)?|Ingenieur(?:in)?)\b/i,
  /(?:Personalleiter(?:in)?|Recruiter(?:in)?|HR\s+[\w\s]{2,20})/i,
];

/**
 * Strip HTML tags and decode common entities to plain text.
 */
function htmlToText(html: string): string {
  let text = html
    // Replace <br>, <br/>, <p>, <div> with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li)>/gi, '\n')
    .replace(/<(?:p|div|tr|li)[^>]*>/gi, '\n')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&auml;/g, 'ä').replace(/&Auml;/g, 'Ä')
    .replace(/&ouml;/g, 'ö').replace(/&Ouml;/g, 'Ö')
    .replace(/&uuml;/g, 'ü').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&#\d+;/g, '') // strip remaining numeric entities
    // Collapse whitespace within lines
    .replace(/[ \t]+/g, ' ');

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/**
 * Extract the signature block from plain text email body.
 * Returns the text after the first greeting/delimiter found,
 * or the last 25 lines if no delimiter is found.
 */
function extractSignatureBlock(text: string): string {
  const lines = text.split('\n');

  // Try to find a greeting delimiter
  for (let i = 0; i < lines.length; i++) {
    for (const delim of SIGNATURE_DELIMITERS) {
      if (delim.test(lines[i])) {
        // Return everything from the delimiter onwards (max 25 lines)
        return lines.slice(i, i + 25).join('\n');
      }
    }
  }

  // Fallback: last 25 lines (likely contains signature if any)
  return lines.slice(-25).join('\n');
}

/**
 * Extract a phone number from text.
 */
function extractPhone(text: string): string | null {
  for (const pattern of PHONE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return (match[1] ?? match[0]).trim();
    }
  }
  return null;
}

/**
 * Extract a company name from text.
 */
function extractCompany(text: string): string | null {
  const matches = text.match(COMPANY_PATTERN);
  if (!matches || matches.length === 0) return null;
  // Return the first match, cleaned up
  return matches[0].trim().replace(/\s+/g, ' ');
}

/**
 * Extract a job title from text.
 */
function extractTitle(text: string): string | null {
  for (const pattern of TITLE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}

/**
 * Parse an email body (HTML) and extract signature information.
 */
export function parseSignature(htmlBody: string): ParsedSignature {
  const text = htmlToText(htmlBody);
  const sigBlock = extractSignatureBlock(text);

  const phone = extractPhone(sigBlock);
  const company = extractCompany(sigBlock);
  const title = extractTitle(sigBlock);

  // Confidence: each found field adds weight
  let confidence = 0;
  if (phone) confidence += 0.35;
  if (company) confidence += 0.35;
  if (title) confidence += 0.3;

  return { phone, company, title, confidence };
}

/**
 * Split a display name into firstName / lastName.
 * "Max Mustermann" → ["Max", "Mustermann"]
 * "Anna Maria Schmidt" → ["Anna Maria", "Schmidt"]
 * "Max" → ["Max", ""]
 */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const name = fullName.trim();
  const lastSpace = name.lastIndexOf(' ');
  if (lastSpace > 0) {
    return {
      firstName: name.substring(0, lastSpace),
      lastName: name.substring(lastSpace + 1),
    };
  }
  return { firstName: name, lastName: '' };
}
