'use client';

import { useRef, useState } from 'react';
import { X, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import Papa from 'papaparse';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export default function ImportModal({ onClose, onImported }: Props) {
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-gray-900">Leads importieren (CSV)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
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
                  {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
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
                {errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
