/**
 * Entfernt Gemini-API-Platzhalter aus Notiz-Inhalten.
 * Typische Artefakte: [cite_start], [cite_end], [cite: ...], [source: ...], etc.
 */
export function sanitizeNoteContent(content: string): string {
  return content
    // [cite_start], [cite_end], [cite], [/cite]
    .replace(/\[cite_start\]/gi, '')
    .replace(/\[cite_end\]/gi, '')
    .replace(/\[\/?cite\]/gi, '')
    // [cite: ...] oder [source: ...] mit beliebigem Inhalt
    .replace(/\[cite:[^\]]*\]/gi, '')
    .replace(/\[source:[^\]]*\]/gi, '')
    // Generische Gemini-Platzhalter [ref_start], [ref_end], etc.
    .replace(/\[ref_start\]/gi, '')
    .replace(/\[ref_end\]/gi, '')
    // Doppelte Leerzeichen bereinigen die durch Entfernung entstehen
    .replace(/  +/g, ' ')
    // Leerzeilen-Cluster auf max 2 reduzieren
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
