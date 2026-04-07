'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Save, Phone, Mail, User, ArrowRightLeft, KeyRound } from 'lucide-react';
import Header from '@/components/Header';

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [nameOrder, setNameOrder] = useState('lastFirst');
  const [nameOrderSaved, setNameOrderSaved] = useState(false);
  const [dialMethod, setDialMethod] = useState('tel');
  const [dialSaved, setDialSaved] = useState(false);
  const [emailSignature, setEmailSignature] = useState('');
  const [sigSaving, setSigSaving] = useState(false);
  const [sigSaved, setSigSaved] = useState(false);
  const [sigError, setSigError] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/profile').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
      if (data.nameOrder) setNameOrder(data.nameOrder);
      if (data.dialMethod) setDialMethod(data.dialMethod);
      if (data.emailSignature !== undefined) setEmailSignature(data.emailSignature);
      if (data.hasPassword !== undefined) setHasPassword(data.hasPassword);
    }).catch(() => {});
  }, [status]);

  async function saveNameOrder(order: string) {
    setNameOrder(order);
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameOrder: order }),
    });
    setNameOrderSaved(true);
    setTimeout(() => setNameOrderSaved(false), 2000);
  }

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

        {/* Name Order */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-tc-blue/20 p-2 rounded-lg">
              <ArrowRightLeft size={20} className="text-tc-blue" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Namensanzeige</h2>
              <p className="text-sm text-gray-500">Reihenfolge in der Leads-Tabelle</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => saveNameOrder('lastFirst')}
              className={`px-4 py-2 text-sm rounded-lg border transition ${nameOrder === 'lastFirst' ? 'bg-tc-blue/10 border-tc-blue/50 text-tc-dark font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Nachname Vorname
            </button>
            <button onClick={() => saveNameOrder('firstLast')}
              className={`px-4 py-2 text-sm rounded-lg border transition ${nameOrder === 'firstLast' ? 'bg-tc-blue/10 border-tc-blue/50 text-tc-dark font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Vorname Nachname
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Bestimmt auch die Sortierung nach Name.
          </p>
          {nameOrderSaved && <span className="text-green-600 text-sm font-medium">✓ Gespeichert</span>}
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
        {/* Password Management */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-lg">
              <KeyRound size={20} className="text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Passwort</h2>
              <p className="text-sm text-gray-500">
                {hasPassword ? 'Passwort ändern oder entfernen' : 'Passwort setzen (aktuell nur SSO)'}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {hasPassword && (
              <input type="password" placeholder="Aktuelles Passwort" value={pwCurrent}
                onChange={e => setPwCurrent(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
            )}
            <div className="grid grid-cols-2 gap-3">
              <input type="password" placeholder="Neues Passwort (min. 6)" value={pwNew}
                onChange={e => setPwNew(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
              <input type="password" placeholder="Passwort bestätigen" value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (pwNew !== pwConfirm) { setPwMsg('Passwörter stimmen nicht überein'); setPwError(true); setTimeout(() => setPwMsg(''), 3000); return; }
                if (pwNew.length < 6) { setPwMsg('Mindestens 6 Zeichen'); setPwError(true); setTimeout(() => setPwMsg(''), 3000); return; }
                setPwSaving(true); setPwMsg(''); setPwError(false);
                const res = await fetch('/api/profile', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ currentPassword: pwCurrent || undefined, newPassword: pwNew }),
                });
                setPwSaving(false);
                if (res.ok) {
                  setPwMsg('Passwort gespeichert'); setPwError(false); setHasPassword(true);
                  setPwCurrent(''); setPwNew(''); setPwConfirm('');
                } else {
                  const e = await res.json();
                  setPwMsg(e.error ?? 'Fehler'); setPwError(true);
                }
                setTimeout(() => setPwMsg(''), 3000);
              }}
              disabled={pwSaving || !pwNew || pwNew !== pwConfirm}
              className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
              <Save size={14} /> {pwSaving ? 'Speichern…' : hasPassword ? 'Passwort ändern' : 'Passwort setzen'}
            </button>
            {hasPassword && (
              <button
                onClick={async () => {
                  if (!confirm('Passwort wirklich löschen? Du kannst dich dann nur noch per SSO anmelden.')) return;
                  setPwSaving(true);
                  const res = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deletePassword: true }),
                  });
                  setPwSaving(false);
                  if (res.ok) { setPwMsg('Passwort gelöscht'); setPwError(false); setHasPassword(false); }
                  else { setPwMsg('Fehler'); setPwError(true); }
                  setTimeout(() => setPwMsg(''), 3000);
                }}
                disabled={pwSaving}
                className="text-red-500 hover:text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200 hover:bg-red-50 transition disabled:opacity-50">
                Passwort löschen
              </button>
            )}
            {pwMsg && <span className={`text-sm font-medium ${pwError ? 'text-red-500' : 'text-green-600'}`}>{pwMsg}</span>}
          </div>
        </div>
      </main>
    </div>
  );
}
