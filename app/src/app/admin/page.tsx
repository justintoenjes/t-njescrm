'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Save, Thermometer, UserPlus, Users, KeyRound, Mail, FileText, Shield } from 'lucide-react';
import Header from '@/components/Header';

type AdminTab = 'texte' | 'benutzer';
type User = { id: string; name: string; email: string; role: string };

export default function AdminPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [tab, setTab] = useState<AdminTab>('texte');
  const [loading, setLoading] = useState(true);

  // Config
  const [daysWarm, setDaysWarm] = useState('14');
  const [daysCold, setDaysCold] = useState('30');
  const [defaultFormalAddress, setDefaultFormalAddress] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Text templates
  const [legalDisclaimer, setLegalDisclaimer] = useState('');
  const [followupSubject, setFollowupSubject] = useState('');
  const [screeningTemplate, setScreeningTemplate] = useState('');
  const [screeningSubject, setScreeningSubject] = useState('');
  const [interviewTemplate, setInterviewTemplate] = useState('');
  const [interviewSubject, setInterviewSubject] = useState('');
  const [interviewBookingLink, setInterviewBookingLink] = useState('');
  const [rejectionTemplate, setRejectionTemplate] = useState('');
  const [rejectionSubject, setRejectionSubject] = useState('');
  const [textSaving, setTextSaving] = useState(false);
  const [textSaved, setTextSaved] = useState(false);

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'USER' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMsg, setUserMsg] = useState('');
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && !isAdmin) router.push('/');
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return;
    Promise.all([
      fetch('/api/config').then(r => { if (!r.ok) throw new Error('Config laden fehlgeschlagen'); return r.json(); }),
      fetch('/api/users').then(r => { if (!r.ok) throw new Error('Benutzer laden fehlgeschlagen'); return r.json(); }),
    ]).then(([config, userList]) => {
      if (config.days_warm !== undefined) setDaysWarm(config.days_warm);
      if (config.days_cold !== undefined) setDaysCold(config.days_cold);
      if (config.default_formal_address !== undefined) setDefaultFormalAddress(config.default_formal_address === 'true');
      if (config.email_legal_disclaimer !== undefined) setLegalDisclaimer(config.email_legal_disclaimer);
      if (config.followup_subject_template !== undefined) setFollowupSubject(config.followup_subject_template);
      if (config.screening_template !== undefined) setScreeningTemplate(config.screening_template);
      if (config.screening_subject_template !== undefined) setScreeningSubject(config.screening_subject_template);
      if (config.interview_template !== undefined) setInterviewTemplate(config.interview_template);
      if (config.interview_subject_template !== undefined) setInterviewSubject(config.interview_subject_template);
      if (config.interview_booking_link !== undefined) setInterviewBookingLink(config.interview_booking_link);
      if (config.rejection_template !== undefined) setRejectionTemplate(config.rejection_template);
      if (config.rejection_subject_template !== undefined) setRejectionSubject(config.rejection_subject_template);
      setUsers(userList);
      setLoading(false);
    }).catch(() => { setLoading(false); });
  }, [status, isAdmin]);

  const [configError, setConfigError] = useState('');
  const [textError, setTextError] = useState('');

  async function saveConfig() {
    const w = parseInt(daysWarm), c = parseInt(daysCold);
    if (isNaN(w) || isNaN(c) || w < 1 || c <= w) return;
    setConfigSaving(true);
    setConfigError('');
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days_warm: String(w), days_cold: String(c), default_formal_address: String(defaultFormalAddress) }),
    });
    setConfigSaving(false);
    if (!res.ok) { setConfigError('Speichern fehlgeschlagen'); return; }
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  }

  async function saveTexts() {
    setTextSaving(true);
    setTextError('');
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_legal_disclaimer: legalDisclaimer,
        followup_subject_template: followupSubject,
        screening_template: screeningTemplate,
        screening_subject_template: screeningSubject,
        interview_template: interviewTemplate,
        interview_subject_template: interviewSubject,
        interview_booking_link: interviewBookingLink,
        rejection_template: rejectionTemplate,
        rejection_subject_template: rejectionSubject,
      }),
    });
    setTextSaving(false);
    if (!res.ok) { setTextError('Speichern fehlgeschlagen'); return; }
    setTextSaved(true);
    setTimeout(() => setTextSaved(false), 2500);
  }

  async function createUser() {
    if (!newUser.name || !newUser.email || !newUser.password) return;
    setCreatingUser(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    if (res.ok) {
      const u = await res.json();
      setUsers([...users, u]);
      setNewUser({ name: '', email: '', password: '', role: 'USER' });
      setUserMsg('Benutzer erstellt');
    } else {
      const e = await res.json();
      setUserMsg(e.error ?? 'Fehler');
    }
    setCreatingUser(false);
    setTimeout(() => setUserMsg(''), 2500);
  }

  async function resetUserPassword(userId: string) {
    if (!resetPassword || resetPassword.length < 6) return;
    setResetting(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: resetPassword }),
    });
    setResetting(false);
    if (res.ok) {
      setUserMsg('Passwort zurückgesetzt');
      setResetUserId(null);
      setResetPassword('');
    } else {
      const e = await res.json();
      setUserMsg(e.error ?? 'Fehler');
    }
    setTimeout(() => setUserMsg(''), 2500);
  }

  const configValid = !isNaN(parseInt(daysWarm)) && !isNaN(parseInt(daysCold)) && parseInt(daysWarm) >= 1 && parseInt(daysCold) > parseInt(daysWarm);

  if (status === 'loading' || loading) return null;
  if (!isAdmin) return null;

  const TABS: { key: AdminTab; label: string; icon: typeof FileText }[] = [
    { key: 'texte', label: 'E-Mail-Vorlagen', icon: FileText },
    { key: 'benutzer', label: 'Benutzer & System', icon: Users },
  ];

  const placeholderHint = (
    <p className="text-xs text-gray-400">
      Platzhalter: <code className="bg-gray-100 px-1 rounded">{'{{NAME}}'}</code>{' '}
      <code className="bg-gray-100 px-1 rounded">{'{{JOBTITEL}}'}</code>{' '}
      <code className="bg-gray-100 px-1 rounded">{'{{FIRMA}}'}</code>{' '}
      <code className="bg-gray-100 px-1 rounded">{'{{BUCHUNGSLINK}}'}</code>
    </p>
  );

  return (
    <div className="min-h-screen bg-tc-light">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="bg-tc-dark/10 p-2 rounded-lg">
            <Shield size={20} className="text-tc-dark" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Administration</h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 py-2.5 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-tc-dark text-tc-dark' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {/* TEXTE TAB */}
        {tab === 'texte' && (
          <div className="space-y-6">
            {placeholderHint}

            {/* Legal Disclaimer */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" /> Rechtliche Hinweise (E-Mail-Footer)
              </h3>
              <textarea value={legalDisclaimer} onChange={e => setLegalDisclaimer(e.target.value)}
                placeholder={"Tönjes Consulting GmbH, Fr.-August-Str. 3 – 26931 Elsfleth\nGeschäftsführer: Justin Tönjes\nHRB 219327, AG Oldenburg"}
                rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none" />
            </div>

            {/* Follow-up Subject */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-tc-blue" /> Follow-Up Betreff-Vorlage
              </h3>
              <input value={followupSubject} onChange={e => setFollowupSubject(e.target.value)}
                placeholder="{{JOBTITEL}} – {{FIRMA}}"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
            </div>

            {/* Screening */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" /> Screening – Eingangsbestätigung (Recruiting)
              </h3>
              <div>
                <label className="text-xs text-gray-500 font-medium">Betreff</label>
                <input value={screeningSubject} onChange={e => setScreeningSubject(e.target.value)}
                  placeholder="Deine Bewerbung als {{JOBTITEL}} bei {{FIRMA}} – Eingangsbestätigung"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Text</label>
                <textarea value={screeningTemplate} onChange={e => setScreeningTemplate(e.target.value)}
                  placeholder={"Hallo {{NAME}},\n\nvielen Dank für deine Bewerbung als {{JOBTITEL}} bei {{FIRMA}}.\n\nWir haben deine Unterlagen erhalten und werden diese sorgfältig prüfen. Du hörst zeitnah von uns.\n\nViele Grüße"}
                  rows={6} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none" />
              </div>
            </div>

            {/* Interview */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Interview-Einladung (Recruiting)
              </h3>
              <div>
                <label className="text-xs text-gray-500 font-medium">Outlook Buchungslink</label>
                <input value={interviewBookingLink} onChange={e => setInterviewBookingLink(e.target.value)}
                  placeholder="https://outlook.office365.com/book/..."
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Betreff</label>
                <input value={interviewSubject} onChange={e => setInterviewSubject(e.target.value)}
                  placeholder="Einladung zum Interview – {{JOBTITEL}} bei {{FIRMA}}"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Text</label>
                <textarea value={interviewTemplate} onChange={e => setInterviewTemplate(e.target.value)}
                  placeholder={"Hallo {{NAME}},\n\nwir laden dich zum Interview ein…\n\n{{BUCHUNGSLINK}}"}
                  rows={6} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none" />
              </div>
            </div>

            {/* Rejection */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" /> Absagetext (Recruiting)
              </h3>
              <div>
                <label className="text-xs text-gray-500 font-medium">Betreff</label>
                <input value={rejectionSubject} onChange={e => setRejectionSubject(e.target.value)}
                  placeholder="Deine Bewerbung als {{JOBTITEL}} bei {{FIRMA}}"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Text</label>
                <textarea value={rejectionTemplate} onChange={e => setRejectionTemplate(e.target.value)}
                  placeholder={"Hallo {{NAME}},\n\nvielen Dank für dein Interesse…"}
                  rows={6} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none" />
              </div>
            </div>

            {/* Save All Texts */}
            <div className="flex items-center gap-3">
              <button onClick={saveTexts} disabled={textSaving}
                className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition disabled:opacity-50">
                <Save size={15} /> {textSaving ? 'Speichern…' : 'Alle Vorlagen speichern'}
              </button>
              {textSaved && <span className="text-green-600 text-sm font-medium">✓ Gespeichert</span>}
              {textError && <span className="text-red-500 text-sm font-medium">{textError}</span>}
            </div>
          </div>
        )}

        {/* BENUTZER TAB */}
        {tab === 'benutzer' && (
          <div className="space-y-6">
            {/* Temperature Config */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Thermometer size={16} className="text-orange-500" /> Lead-Temperatur
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Hot → Warm nach (Tagen)</label>
                  <input type="number" min={1} value={daysWarm} onChange={e => setDaysWarm(e.target.value)}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Warm → Cold nach (Tagen)</label>
                  <input type="number" min={2} value={daysCold} onChange={e => setDaysCold(e.target.value)}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <label className="text-xs text-gray-500 font-medium block mb-2">Standard-Anrede (KI-Texte)</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setDefaultFormalAddress(false)}
                    className={`px-4 py-2 text-sm rounded-lg border transition ${!defaultFormalAddress ? 'bg-tc-blue/10 border-tc-blue/50 text-tc-dark font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    Du (informell)
                  </button>
                  <button onClick={() => setDefaultFormalAddress(true)}
                    className={`px-4 py-2 text-sm rounded-lg border transition ${defaultFormalAddress ? 'bg-tc-blue/10 border-tc-blue/50 text-tc-dark font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    Sie (formell)
                  </button>
                </div>
              </div>
              {!configValid && daysWarm && daysCold && (
                <p className="text-red-500 text-xs">days_cold muss größer als days_warm sein.</p>
              )}
              <div className="flex items-center gap-3">
                <button onClick={saveConfig} disabled={configSaving || !configValid}
                  className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
                  <Save size={14} /> {configSaving ? 'Speichern…' : 'Speichern'}
                </button>
                {configSaved && <span className="text-green-600 text-sm font-medium">✓ Gespeichert</span>}
              {configError && <span className="text-red-500 text-sm font-medium">{configError}</span>}
              </div>
            </div>

            {/* User Management */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Users size={16} className="text-tc-blue" /> Benutzerverwaltung
                <span className="text-xs text-gray-400 font-normal ml-1">{users.length} Benutzer</span>
              </h3>

              <div className="divide-y divide-gray-100">
                {users.map(u => (
                  <div key={u.id} className="py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{u.name}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setResetUserId(resetUserId === u.id ? null : u.id)}
                          className="text-gray-400 hover:text-tc-blue transition p-1 rounded" title="Passwort zurücksetzen">
                          <KeyRound size={15} />
                        </button>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${u.role === 'ADMIN' ? 'bg-tc-blue/20 text-tc-dark' : 'bg-gray-100 text-gray-600'}`}>
                          {u.role}
                        </span>
                      </div>
                    </div>
                    {resetUserId === u.id && (
                      <div className="flex gap-2">
                        <input type="password" placeholder="Neues Passwort (min. 6 Zeichen)" value={resetPassword}
                          onChange={e => setResetPassword(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') resetUserPassword(u.id); }}
                          autoFocus className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                        <button onClick={() => resetUserPassword(u.id)} disabled={resetting || resetPassword.length < 6}
                          className="bg-tc-dark hover:bg-tc-dark/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                          {resetting ? 'Setze…' : 'Setzen'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-gray-100 space-y-3">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><UserPlus size={15} /> Neuer Benutzer</p>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Name *" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                  <input placeholder="E-Mail *" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                  <input placeholder="Passwort *" type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                  <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue">
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={createUser} disabled={creatingUser || !newUser.name || !newUser.email || !newUser.password}
                    className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
                    <UserPlus size={14} /> {creatingUser ? 'Erstellen…' : 'Erstellen'}
                  </button>
                  {userMsg && <span className={`text-sm font-medium ${userMsg.includes('erstellt') || userMsg.includes('zurückgesetzt') ? 'text-green-600' : 'text-red-500'}`}>{userMsg}</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
