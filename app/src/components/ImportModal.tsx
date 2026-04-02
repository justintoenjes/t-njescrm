'use client';

import { useRef, useState, useCallback } from 'react';
import { X, Upload, AlertCircle, CheckCircle2, Mail, Search, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { useCategory } from '@/lib/category-context';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

type Tab = 'csv' | 'mailbox';

// ── Mailbox scan types ──
type ScannedContact = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  source: 'signature' | 'offer';
  matchedSubject: string;
  matchedDate: string;
  matchedPreview: string;
  confidence: number;
  isDuplicate: boolean;
  existingLeadId?: string;
};

type ScanMode = 'signatures' | 'offers' | 'both';
type ScanStep = 'config' | 'results' | 'done';

export default function ImportModal({ onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>('csv');
  const { category } = useCategory();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full flex flex-col max-h-[90vh] transition-all ${
        tab === 'mailbox' ? 'max-w-5xl' : 'max-w-md'
      }`}>
        {/* Header with tabs */}
        <div className="border-b shrink-0">
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="font-semibold text-gray-900">Leads importieren</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="flex px-4 mt-2">
            <button
              onClick={() => setTab('csv')}
              className={`py-2 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'csv' ? 'border-tc-dark text-tc-dark' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Upload size={14} className="inline mr-1.5 -mt-0.5" />
              CSV-Datei
            </button>
            <button
              onClick={() => setTab('mailbox')}
              className={`py-2 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'mailbox' ? 'border-tc-dark text-tc-dark' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Mail size={14} className="inline mr-1.5 -mt-0.5" />
              Postfach scannen
            </button>
          </div>
        </div>

        {tab === 'csv' ? (
          <CsvTab onClose={onClose} onImported={onImported} />
        ) : (
          <MailboxTab onClose={onClose} onImported={onImported} category={category} />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// CSV Tab
// ══════════════════════════════════════════════

function CsvTab({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    setErrors([]);
    setResult(null);
    setLoading(true);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (parsed) => {
        if (parsed.errors.length > 0) {
          setErrors(parsed.errors.map((e) => `CSV-Fehler Zeile ${e.row}: ${e.message}`));
          setLoading(false);
          return;
        }
        try {
          const res = await fetch('/api/leads/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: parsed.data }),
          });
          const data = await res.json();
          setResult(data);
          if (data.created > 0) onImported();
        } catch {
          setErrors(['Netzwerkfehler beim Import']);
        } finally {
          setLoading(false);
        }
      },
    });
  }

  return (
    <>
      <div className="p-4 space-y-4 overflow-y-auto">
        <p className="text-sm text-gray-500">
          Die CSV-Datei muss eine Kopfzeile mit folgenden Spalten enthalten:
        </p>
        <code className="block text-xs bg-gray-50 rounded p-2 text-gray-700">
          firstName, lastName, company, email, phone
        </code>
        <p className="text-xs text-gray-400">
          Alternativ: <code className="bg-gray-100 px-1 rounded">name</code> (wird automatisch in Vor-/Nachname gesplittet). Mindestens Vorname ist erforderlich.
        </p>

        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-tc-blue transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          <Upload size={24} className="mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500">CSV-Datei hier ablegen oder klicken</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {loading && <p className="text-sm text-center text-tc-blue animate-pulse">Importiere…</p>}

        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.created > 0 ? 'bg-green-50' : 'bg-yellow-50'}`}>
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 size={16} className="text-green-600" />
              {result.created} Lead(s) importiert
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-yellow-700">
                {result.errors.map((e, i) => <li key={i}>&bull; {e}</li>)}
              </ul>
            )}
          </div>
        )}

        {errors.length > 0 && (
          <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
            <div className="flex items-center gap-2 font-medium mb-1">
              <AlertCircle size={16} />
              Fehler beim Parsen
            </div>
            <ul className="space-y-1">
              {errors.map((e, i) => <li key={i}>&bull; {e}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-end p-4 border-t shrink-0">
        <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
          Schließen
        </button>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════
// Mailbox Scan Tab
// ══════════════════════════════════════════════

function MailboxTab({ onClose, onImported, category }: { onClose: () => void; onImported: () => void; category: string }) {
  const [step, setStep] = useState<ScanStep>('config');
  const [mode, setMode] = useState<ScanMode>('both');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [scanning, setScanning] = useState(false);
  const [contacts, setContacts] = useState<ScannedContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalScanned, setTotalScanned] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allScanned, setAllScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null);

  // Fetch one page and return { newUniqueCount, cursor, scanned }
  const fetchPage = useCallback(async (cursor: string | null, existingEmails: Set<string>): Promise<{
    newContacts: ScannedContact[];
    newUniqueCount: number;
    nextCursor: string | null;
    scanned: number;
  }> => {
    const res = await fetch('/api/mailbox-scan/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        ...(cursor ? { cursor } : {}),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Fehler (${res.status})`);
    }

    const data = await res.json();
    const pageContacts: ScannedContact[] = data.contacts ?? [];
    const unique = pageContacts.filter(c => !existingEmails.has(c.email.toLowerCase()));

    return {
      newContacts: pageContacts,
      newUniqueCount: unique.length,
      nextCursor: data.nextCursor ?? null,
      scanned: data.totalScanned ?? 0,
    };
  }, [mode, dateFrom, dateTo]);

  async function startScan() {
    setScanning(true);
    setScanError(null);
    setContacts([]);
    setSelected(new Set());
    setTotalScanned(0);
    setNextCursor(null);
    setAllScanned(false);
    setExpandedEmail(null);

    try {
      const result = await fetchPage(null, new Set());
      setContacts(result.newContacts);
      setNextCursor(result.nextCursor);
      setTotalScanned(result.scanned);
      if (!result.nextCursor) setAllScanned(true);

      // Start with nothing selected — user picks explicitly
      setSelected(new Set());
      setStep('results');
    } catch (e: any) {
      setScanError(e.message ?? 'Netzwerkfehler');
    } finally {
      setScanning(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || allScanned) return;
    setLoadingMore(true);

    try {
      let cursor: string | null = nextCursor;
      let totalNewUnique = 0;
      let pagesLoaded = 0;
      const MAX_PAGES = 10; // safety limit

      // Keep loading until we find at least 1 new contact or run out of pages
      while (cursor && totalNewUnique === 0 && pagesLoaded < MAX_PAGES) {
        const existingEmails = new Set(contacts.map(c => c.email.toLowerCase()));
        const result = await fetchPage(cursor, existingEmails);
        pagesLoaded++;

        const unique = result.newContacts.filter(c => !existingEmails.has(c.email.toLowerCase()));
        totalNewUnique += unique.length;

        if (unique.length > 0) {
          setContacts(prev => [...prev, ...unique]);
        }

        setTotalScanned(prev => prev + result.scanned);
        cursor = result.nextCursor;
        setNextCursor(result.nextCursor);

        if (!result.nextCursor) {
          setAllScanned(true);
          break;
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleSelect(email: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleAll() {
    const nonDuplicates = contacts.filter(c => !c.isDuplicate);
    if (selected.size === nonDuplicates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nonDuplicates.map(c => c.email)));
    }
  }

  async function importSelected() {
    const toImport = contacts.filter(c => selected.has(c.email) && !c.isDuplicate);
    if (toImport.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch('/api/mailbox-scan/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: toImport.map(c => ({
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            phone: c.phone ?? undefined,
            company: c.company ?? undefined,
          })),
          category,
        }),
      });

      const data = await res.json();
      setImportResult(data);
      if (data.created > 0) onImported();
      setStep('done');
    } catch {
      setImportResult({ created: 0, errors: ['Netzwerkfehler beim Import'] });
      setStep('done');
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = contacts.filter(c => selected.has(c.email) && !c.isDuplicate).length;

  // ── Step: Config ──
  if (step === 'config') {
    return (
      <>
        <div className="p-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-gray-500">
            Durchsucht Ihr Microsoft 365 Postfach nach potenziellen Kontakten mit Geschäftssignaturen oder Angebotskonversationen.
          </p>

          <div className="space-y-2">
            <label className="text-xs text-gray-500 font-medium">Suchmodus</label>
            {([
              { value: 'both' as ScanMode, label: 'Beides (empfohlen)', desc: 'Signaturen + Angebotskonversationen' },
              { value: 'signatures' as ScanMode, label: 'Nur Signaturen', desc: 'Kontakte mit Geschäftssignatur (Firma, Telefon, Position)' },
              { value: 'offers' as ScanMode, label: 'Nur Angebote', desc: 'E-Mails mit Angebots-/Proposal-Keywords' },
            ]).map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  mode === opt.value ? 'border-tc-blue bg-tc-blue/5' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="scanMode"
                  value={opt.value}
                  checked={mode === opt.value}
                  onChange={() => setMode(opt.value)}
                  className="mt-0.5 accent-tc-blue"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500 font-medium">Zeitraum (optional)</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-400">Von</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400">Bis</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
              </div>
            </div>
          </div>

          {scanError && (
            <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} />
              {scanError}
            </div>
          )}
        </div>

        <div className="flex justify-between p-4 border-t shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            Schließen
          </button>
          <button
            onClick={startScan}
            disabled={scanning}
            className="flex items-center gap-2 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {scanning ? (
              <><Loader2 size={14} className="animate-spin" /> Scanne…</>
            ) : (
              <><Search size={14} /> Scan starten</>
            )}
          </button>
        </div>
      </>
    );
  }

  // ── Step: Results ──
  if (step === 'results') {
    const nonDuplicates = contacts.filter(c => !c.isDuplicate);

    return (
      <>
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Stats bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b text-sm shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-gray-600">
                <strong>{contacts.length}</strong> Kontakte gefunden
                {contacts.length !== nonDuplicates.length && (
                  <span className="text-gray-400"> ({contacts.length - nonDuplicates.length} bereits vorhanden)</span>
                )}
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500">{totalScanned} E-Mails gescannt</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-900">
              <input
                type="checkbox"
                checked={selected.size === nonDuplicates.length && nonDuplicates.length > 0}
                onChange={toggleAll}
                className="accent-tc-blue"
              />
              Alle
            </label>
          </div>

          {/* Contact list */}
          <div className="flex-1 overflow-y-auto">
            {contacts.length === 0 && !loadingMore ? (
              <div className="text-center py-12 text-gray-400">
                <Mail size={32} className="mx-auto mb-2 opacity-50" />
                <p>Keine Kontakte mit Geschäftssignatur gefunden.</p>
                <p className="text-xs mt-1">Versuche einen anderen Zeitraum oder Suchmodus.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="pl-4 pr-2 py-2 w-8"></th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">E-Mail</th>
                    <th className="px-2 py-2 hidden lg:table-cell">Firma</th>
                    <th className="px-2 py-2 hidden lg:table-cell">Telefon</th>
                    <th className="px-2 py-2 hidden xl:table-cell">Position</th>
                    <th className="px-2 py-2 hidden xl:table-cell">Quelle</th>
                    <th className="px-2 py-2 hidden 2xl:table-cell">Betreff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map(contact => {
                    const isExpanded = expandedEmail === contact.email;
                    return (
                      <tr
                        key={contact.email}
                        className={`group ${contact.isDuplicate ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50 cursor-pointer'}`}
                        onClick={() => !contact.isDuplicate && setExpandedEmail(isExpanded ? null : contact.email)}
                      >
                        <td className="pl-4 pr-2 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(contact.email)}
                            onChange={() => toggleSelect(contact.email)}
                            disabled={contact.isDuplicate}
                            className="accent-tc-blue mt-0.5"
                          />
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          <div className="flex items-center gap-1">
                            {!contact.isDuplicate && (
                              isExpanded
                                ? <ChevronDown size={12} className="text-gray-400 shrink-0" />
                                : <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-400 shrink-0" />
                            )}
                            <span className="font-medium text-gray-900">
                              {`${contact.firstName} ${contact.lastName}`.trim() || '\u2014'}
                            </span>
                          </div>
                          {contact.isDuplicate && (
                            <span className="text-xs text-amber-600 ml-4">bereits vorhanden</span>
                          )}
                          {isExpanded && contact.matchedPreview && (
                            <div className="mt-2 ml-4 p-2.5 bg-gray-100 rounded-lg text-xs text-gray-600 leading-relaxed max-w-xl">
                              <div className="text-xs font-medium text-gray-500 mb-1">
                                {contact.matchedSubject || 'Kein Betreff'}
                                <span className="font-normal text-gray-400 ml-2">
                                  {contact.matchedDate ? new Date(contact.matchedDate).toLocaleDateString('de-DE') : ''}
                                </span>
                              </div>
                              {contact.matchedPreview}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-gray-600 truncate max-w-[200px] align-top">{contact.email}</td>
                        <td className="px-2 py-2.5 text-gray-600 hidden lg:table-cell align-top">{contact.company ?? '\u2014'}</td>
                        <td className="px-2 py-2.5 text-gray-600 hidden lg:table-cell align-top">{contact.phone ?? '\u2014'}</td>
                        <td className="px-2 py-2.5 text-gray-500 hidden xl:table-cell text-xs align-top">{contact.title ?? '\u2014'}</td>
                        <td className="px-2 py-2.5 hidden xl:table-cell align-top">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            contact.source === 'offer'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {contact.source === 'offer' ? 'Angebot' : 'Signatur'}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-gray-400 text-xs hidden 2xl:table-cell truncate max-w-[200px] align-top">
                          {contact.matchedSubject || '\u2014'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer: load more / all scanned */}
          <div className="border-t px-4 py-2 text-center shrink-0">
            {loadingMore ? (
              <span className="text-sm text-tc-blue flex items-center gap-1.5 justify-center animate-pulse">
                <Loader2 size={14} className="animate-spin" /> Suche weitere Kontakte… ({totalScanned} E-Mails)
              </span>
            ) : allScanned ? (
              <span className="text-sm text-gray-400 flex items-center gap-1.5 justify-center">
                <CheckCircle2 size={14} /> Alle E-Mails im Zeitraum durchsucht ({totalScanned})
              </span>
            ) : nextCursor && contacts.length < 500 ? (
              <button
                onClick={loadMore}
                className="text-sm text-tc-blue hover:text-tc-dark transition flex items-center gap-1.5 mx-auto"
              >
                <ChevronDown size={14} /> Mehr laden
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t shrink-0">
          <button
            onClick={() => { setStep('config'); setContacts([]); setSelected(new Set()); setAllScanned(false); }}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Zurück
          </button>
          <button
            onClick={importSelected}
            disabled={selectedCount === 0 || importing}
            className="flex items-center gap-2 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {importing ? (
              <><Loader2 size={14} className="animate-spin" /> Importiere…</>
            ) : (
              <>{selectedCount} Kontakte importieren</>
            )}
          </button>
        </div>
      </>
    );
  }

  // ── Step: Done ──
  return (
    <>
      <div className="p-6 space-y-4">
        {importResult && importResult.created > 0 ? (
          <div className="bg-green-50 rounded-lg p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-green-800">
              <CheckCircle2 size={18} className="text-green-600" />
              {importResult.created} Lead(s) erfolgreich importiert
            </div>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-yellow-700">
                {importResult.errors.map((e, i) => <li key={i}>&bull; {e}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div className="bg-red-50 rounded-lg p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-red-700">
              <AlertCircle size={16} />
              Import fehlgeschlagen
            </div>
            {importResult?.errors && importResult.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-red-600">
                {importResult.errors.map((e, i) => <li key={i}>&bull; {e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between p-4 border-t shrink-0">
        <button
          onClick={() => { setStep('config'); setContacts([]); setSelected(new Set()); setImportResult(null); setAllScanned(false); }}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          Neuer Scan
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm bg-tc-dark hover:bg-tc-dark/90 text-white rounded-lg">
          Schließen
        </button>
      </div>
    </>
  );
}
