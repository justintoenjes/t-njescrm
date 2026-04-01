'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Save, Phone, Mail, User } from 'lucide-react';
import Header from '@/components/Header';

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [dialMethod, setDialMethod] = useState('tel');
  const [dialSaved, setDialSaved] = useState(false);
  const [emailSignature, setEmailSignature] = useState('');
  const [sigSaving, setSigSaving] = useState(false);
  const [sigSaved, setSigSaved] = useState(false);
  const [sigError, setSigError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/profile').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
      if (data.dialMethod) setDialMethod(data.dialMethod);
      if (data.emailSignature !== undefined) setEmailSignature(data.emailSignature);
    }).catch(() => {});
  }, [status]);

  async function saveDialMethod(method: string) {
    setDialMethod(method);
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialMethod: method }),
    });
    setDialSaved(true);
    setTimeout(() => setDialSaved(false), 2000);
  }

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-tc-light">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-tc-blue/20 p-2 rounded-lg">
            <User size={20} className="text-tc-blue" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Mein Profil</h1>
            <p className="text-sm text-gray-500">{session?.user?.name} · {session?.user?.email}</p>
          </div>
        </div>

        {/* Dial Method */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg">
              <Phone size={20} className="text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Telefonie</h2>
              <p className="text-sm text-gray-500">Wählmethode für Click-to-Call</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => saveDialMethod('tel')}
              className={`px-4 py-2 text-sm rounded-lg border transition ${dialMethod === 'tel' ? 'bg-tc-blue/10 border-tc-blue/50 text-tc-dark font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Telefonie-App
            </button>
            <button onClick={() => saveDialMethod('fritzbox')}
              className={`px-4 py-2 text-sm rounded-lg border transition ${dialMethod === 'fritzbox' ? 'bg-tc-blue/10 border-tc-blue/50 text-tc-dark font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Fritz!Box Wählhilfe
            </button>
          </div>
          <p className="text-xs text-gray-400">
            {dialMethod === 'tel' ? 'Öffnet die Telefonie-App auf deinem Gerät (Teams, FaceTime, Softphone).' : 'Die Fritz!Box wählt die Nummer und verbindet mit dem konfigurierten Telefon.'}
          </p>
          {dialSaved && <span className="text-green-600 text-sm font-medium">✓ Gespeichert</span>}
        </div>

        {/* Email Signature */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-tc-blue/20 p-2 rounded-lg">
              <Mail size={20} className="text-tc-blue" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">E-Mail-Signatur</h2>
              <p className="text-sm text-gray-500">Wird an Follow-Up E-Mails angehängt</p>
            </div>
          </div>
          <textarea value={emailSignature} onChange={e => setEmailSignature(e.target.value)}
            placeholder={"Mit freundlichen Grüßen\nMax Mustermann\nTönjes Consulting GmbH\n+49 4404 9590682"}
            rows={5} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none" />
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                setSigSaving(true);
                setSigError('');
                const res = await fetch('/api/profile', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ emailSignature }),
                });
                setSigSaving(false);
                if (!res.ok) { setSigError('Speichern fehlgeschlagen'); return; }
                setSigSaved(true);
                setTimeout(() => setSigSaved(false), 2000);
              }}
              disabled={sigSaving}
              className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
              <Save size={14} /> {sigSaving ? 'Speichern…' : 'Speichern'}
            </button>
            {sigSaved && <span className="text-green-600 text-sm font-medium">✓ Gespeichert</span>}
            {sigError && <span className="text-red-500 text-sm font-medium">{sigError}</span>}
          </div>
        </div>
      </main>
    </div>
  );
}
