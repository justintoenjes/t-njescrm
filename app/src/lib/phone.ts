/**
 * Normalizes a German phone number to +49XXXXXXXXX format (no spaces, no dashes).
 * Returns null if input is empty/invalid.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Remove all formatting characters: spaces, dashes, slashes, parentheses, dots
  let n = phone.replace(/[\s\-\/()+.]/g, '');

  // Remove leading zeros from country code variants
  if (n.startsWith('0049')) {
    n = n.slice(4);
  } else if (n.startsWith('49') && n.length > 6) {
    n = n.slice(2);
  } else if (n.startsWith('0')) {
    n = n.slice(1);
  }

  // Must have remaining digits
  if (!n || n.length < 3) return null;

  return '+49' + n;
}
