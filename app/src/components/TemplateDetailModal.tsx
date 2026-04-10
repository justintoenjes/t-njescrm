'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Trash2, Users, Briefcase, Package, Lock, AlertTriangle, Plus, FileText, Mail } from 'lucide-react';
import { TEMP_COLORS, Temperature } from '@/lib/temperature';
import { PHASE_LABELS, PHASE_COLORS, LeadPhase } from '@/lib/phase';
import { OPP_STAGE_LABELS, OPP_STAGE_COLORS, TERMINAL_STAGES } from '@/lib/opportunity';
import KPIBar from '@/components/group-detail/KPIBar';
import GroupTimeline from '@/components/group-detail/GroupTimeline';
import GroupNoteInput from '@/components/group-detail/GroupNoteInput';
import { CALL_PATTERN } from '@/components/group-detail/GroupTimeline';
import type { GroupNote, GroupEmail, GroupActivity, NoteTarget } from '@/components/group-detail/types';
import { useCategory } from '@/lib/category-context';

type Candidate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phase: LeadPhase;
  score: number;
  temperature: Temperature;
  lastContactedAt: string | null;
  assignedTo: { id: string; name: string } | null;
  oppStage: string;
  opportunities: {
    id: string;
    title: string;
    stage: string;
    value: number | null;
  }[];
};

type AssignedUser = { id: string; name: string; email: string };

type TemplateData = {
  id: string;
  name: string;
  description: string | null;
  defaultValue: number | null;
  category: 'VERTRIEB' | 'RECRUITING';
  candidateCount: number;
  candidates: Candidate[];
  assignedUsers?: AssignedUser[];
  restricted?: boolean;
};

type MobileTab = 'timeline' | 'candidates' | 'details';

type RejectionCandidate = {
  candidateName: string;
  candidateEmail: string | null;
  oppId: string;
  oppTitle: string;
  subject: string;
  body: string;
};

type Props = {
  templateId: string;
  isAdmin: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onOpenLead?: (leadId: string) => void;
  onOpenOpportunity?: (oppId: string) => void;
};

export default function TemplateDetailModal({ templateId, isAdmin, onClose, onUpdate, onOpenLead, onOpenOpportunity }: Props) {
  const { category } = useCategory();
  const isRecruiting = category === 'RECRUITING';
  const entityLabel = isRecruiting ? 'Stelle' : 'Produkt';
  const candidatesLabel = isRecruiting ? 'Kandidaten' : 'Kontakte';

  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', description: '', defaultValue: '' });
  const [saving, setSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('timeline');
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [newCandidate, setNewCandidate] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [creatingCandidate, setCreatingCandidate] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);

  async function handleFileUpload(file: File) {
    setCvFile(file);
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/extract-cv', { method: 'POST', body: formData });
      if (!res.ok) return;
      const data = await res.json();
      setNewCandidate(prev => ({
        ...prev,
        firstName: prev.firstName || data.firstName || '',
        lastName: prev.lastName || data.lastName || '',
        email: prev.email || data.email || '',
        phone: prev.phone || data.phone || '',
      }));
    } finally {
      setExtracting(false);
    }
  }

  async function createCandidate() {
    if (!newCandidate.firstName.trim()) return;
    setCreatingCandidate(true);
    try {
      // Create lead
      const leadRes = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newCandidate.firstName.trim(),
          lastName: newCandidate.lastName.trim(),
          email: newCandidate.email.trim() || null,
          phone: newCandidate.phone.trim() || null,
          category: 'RECRUITING',
        }),
      });
      if (!leadRes.ok) return;
      const lead = await leadRes.json();
      // Create opportunity linked to this template
      const oppRes = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: template?.name ?? 'Bewerbung',
          leadId: lead.id,
          templateId: templateId,
          stage: 'SCREENING',
        }),
      });
      // Upload file as attachment
      if (cvFile && oppRes.ok) {
        const opp = await oppRes.json();
        const fd = new FormData();
        fd.append('file', cvFile);
        fd.append('opportunityId', opp.id);
        fd.append('leadId', lead.id);
        await fetch('/api/attachments', { method: 'POST', body: fd });
      }
      setNewCandidate({ firstName: '', lastName: '', email: '', phone: '' });
      setCvFile(null);
      setShowNewCandidate(false);
      fetchTemplate();
      onUpdate?.();
    } finally {
      setCreatingCandidate(false);
    }
  }

  // Timeline
  const [activities, setActivities] = useState<GroupActivity[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [noteTargets, setNoteTargets] = useState<NoteTarget[]>([]);

  // Close position (mass rejection)
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [rejectionCandidates, setRejectionCandidates] = useState<RejectionCandidate[]>([]);
  const [closingInProgress, setClosingInProgress] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closeProgress, setCloseProgress] = useState({ done: 0, total: 0 });

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/templates/${templateId}`);
    if (!res.ok) { setLoading(false); return; }
    const data: TemplateData = await res.json();
    setTemplate(data);
    setForm({
      name: data.name,
      description: data.description ?? '',
      defaultValue: data.defaultValue != null ? String(data.defaultValue) : '',
    });

    // Build note targets from candidates
    const targets: NoteTarget[] = [];
    data.candidates.forEach(c => {
      targets.push({ type: 'lead', label: `${c.firstName} ${c.lastName}`.trim(), id: c.id });
      c.opportunities
        .filter(o => !TERMINAL_STAGES.includes(o.stage as any))
        .forEach(o => targets.push({ type: 'opportunity', label: `${o.title} (${`${c.firstName} ${c.lastName}`.trim()})`, id: o.id }));
    });
    setNoteTargets(targets);
    setLoading(false);
  }, [templateId]);

  const fetchTimeline = useCallback(async () => {
    setTimelineLoading(true);
    const res = await fetch(`/api/templates/${templateId}/timeline`);
    if (!res.ok) { setTimelineLoading(false); return; }
    const data = await res.json();

    const notes: GroupNote[] = data.notes ?? [];
    const emails: GroupEmail[] = data.emails ?? [];

    const acts: GroupActivity[] = [
      ...notes
        .filter((n: GroupNote) => !CALL_PATTERN.test(n.content))
        .map((n: GroupNote) => ({ type: 'note' as const, id: n.id, date: new Date(n.createdAt), note: n })),
      ...notes
        .filter((n: GroupNote) => CALL_PATTERN.test(n.content))
        .map((n: GroupNote) => ({ type: 'call' as const, id: n.id, date: new Date(n.createdAt), note: n })),
      ...emails.map((e: GroupEmail) => ({ type: 'email' as const, id: e.id, date: new Date(e.date), email: e })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    setActivities(acts);
    setTimelineLoading(false);
  }, [templateId]);

  useEffect(() => { fetchTemplate(); fetchTimeline(); }, [fetchTemplate, fetchTimeline]);
  useEffect(() => {
    if (isAdmin) fetch('/api/users').then(r => r.json()).then(setAllUsers).catch(() => {});
  }, [isAdmin]);

  async function saveChanges() {
    setSaving(true);
    await fetch(`/api/templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        defaultValue: form.defaultValue ? parseFloat(form.defaultValue) : null,
      }),
    });
    setSaving(false);
    fetchTemplate();
    onUpdate();
  }

  async function toggleUserAssignment(userId: string) {
    if (!template) return;
    const current = template.assignedUsers?.map(u => u.id) ?? [];
    const newIds = current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId];
    await fetch(`/api/templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedUserIds: newIds }),
    });
    fetchTemplate();
  }

  async function deleteTemplate() {
    if (!confirm(`${entityLabel} "${template?.name}" wirklich löschen?`)) return;
    await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
    onClose();
    onUpdate();
  }

  async function handleAddNote(content: string, target: NoteTarget) {
    const url = target.type === 'lead'
      ? `/api/leads/${target.id}/notes`
      : `/api/opportunities/${target.id}/notes`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    fetchTimeline();
  }

  // --- Close position logic ---
  async function prepareClosePosition() {
    if (!template) return;
    setCloseError('');

    // Get rejection template from config
    const cfgRes = await fetch('/api/config');
    const cfg = await cfgRes.json();
    const rejectionTemplate = cfg.rejection_template || '';
    const rejectionSubject = cfg.rejection_subject_template || 'Absage';

    // Find all open candidates (not HIRED, not REJECTED)
    const openCandidates = template.candidates.filter(c =>
      c.oppStage !== 'HIRED' && c.oppStage !== 'REJECTED'
    );

    if (openCandidates.length === 0) {
      setCloseError('Keine offenen Kandidaten vorhanden.');
      return;
    }

    // Build rejection drafts with placeholder replacement
    const drafts: RejectionCandidate[] = openCandidates.map(c => {
      // Find the opportunity for this template
      const opp = c.opportunities.find(o => o.stage !== 'HIRED' && o.stage !== 'REJECTED');
      const oppTitle = opp?.title ?? template.name;

      function replacePlaceholders(text: string) {
        return text
          .replace(/\{\{NAME\}\}/g, `${c.firstName} ${c.lastName}`.trim())
          .replace(/\{\{JOBTITEL\}\}/g, oppTitle)
          .replace(/\{\{FIRMA\}\}/g, '');
      }

      return {
        candidateName: `${c.firstName} ${c.lastName}`.trim(),
        candidateEmail: c.email,
        oppId: opp?.id ?? '',
        oppTitle,
        subject: replacePlaceholders(rejectionSubject),
        body: replacePlaceholders(rejectionTemplate),
      };
    }).filter(d => d.oppId); // Only include candidates with a valid opportunity

    setRejectionCandidates(drafts);
    setShowCloseDialog(true);
  }

  async function executeClosePosition() {
    setClosingInProgress(true);
    setCloseError('');
    const total = rejectionCandidates.length;
    setCloseProgress({ done: 0, total });

    for (let i = 0; i < rejectionCandidates.length; i++) {
      const c = rejectionCandidates[i];
      try {
        // Send rejection email if candidate has an email
        if (c.candidateEmail && c.body) {
          await fetch('/api/emails/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: c.candidateEmail, subject: c.subject, bodyText: c.body }),
          });
        }
        // Update opportunity stage to REJECTED
        await fetch(`/api/opportunities/${c.oppId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: 'REJECTED' }),
        });
      } catch (err) {
        setCloseError(`Fehler bei ${c.candidateName}: ${(err as Error).message}`);
      }
      setCloseProgress({ done: i + 1, total });
    }

    setClosingInProgress(false);
    setShowCloseDialog(false);
    setRejectionCandidates([]);
    fetchTemplate();
    fetchTimeline();
    onUpdate();
  }

  // Collect all opportunities from candidates for this template
  const allOpps = template?.candidates.flatMap(c =>
    c.opportunities.map(o => ({ ...o, leadName: `${c.firstName} ${c.lastName}`.trim() }))
  ) ?? [];
  const activeOpps = allOpps.filter(o => !TERMINAL_STAGES.includes(o.stage as any));
  const totalValue = activeOpps.reduce((sum, o) => sum + (o.value ?? 0), 0);
  const wonCount = allOpps.filter(o => o.stage === 'WON' || o.stage === 'HIRED').length;

  const kpis = template ? [
    { label: candidatesLabel, value: template.candidateCount, color: 'bg-gray-50 text-gray-700 border-gray-200' },
    { label: isRecruiting ? 'Bewerbungen' : 'Anfragen', value: activeOpps.length, color: 'bg-teal-50 text-teal-700 border-teal-200' },
    { label: 'Pipeline', value: `${totalValue.toLocaleString('de-DE')} €`, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    ...(wonCount > 0 ? [{ label: isRecruiting ? 'Eingestellt' : 'Gewonnen', value: wonCount, color: 'bg-green-50 text-green-700 border-green-200' }] : []),
    ...(template.defaultValue != null ? [{ label: isRecruiting ? 'Gehalt' : 'Wert', value: `${template.defaultValue.toLocaleString('de-DE')} €`, color: 'bg-purple-50 text-purple-700 border-purple-200' }] : []),
  ] : [];

  const openCandidateCount = template?.candidates.filter(c => c.oppStage !== 'HIRED' && c.oppStage !== 'REJECTED').length ?? 0;

  const MOBILE_TABS: { key: MobileTab; label: string }[] = [
    { key: 'timeline', label: 'Aktivität' },
    { key: 'candidates', label: `${candidatesLabel} (${template?.candidateCount ?? 0})` },
    { key: 'details', label: 'Details' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 lg:p-4 modal-safe-area"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white lg:rounded-2xl shadow-2xl w-full h-full lg:w-[95vw] lg:max-w-7xl lg:h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Package size={20} className="text-gray-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">{template?.name ?? 'Laden…'}</h2>
              {template?.description && (
                <p className="text-xs text-gray-500 truncate">{template.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isRecruiting && openCandidateCount > 0 && (
              <button
                onClick={prepareClosePosition}
                className="flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg transition"
              >
                <Lock size={13} /> Stelle schließen
              </button>
            )}
            {isAdmin && (
              <button onClick={deleteTemplate} className="text-red-400 hover:text-red-600 p-1 rounded" title="Löschen">
                <Trash2 size={18} />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="lg:hidden flex border-b px-4 overflow-x-auto shrink-0">
          {MOBILE_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setMobileTab(t.key)}
              className={`py-2.5 px-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap
                ${mobileTab === t.key
                  ? 'border-tc-dark text-tc-dark'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {loading ? (
            <p className="w-full text-center py-12 text-gray-400">Laden…</p>
          ) : (
            <>
              {/* Left Panel */}
              <div className={`w-full lg:w-[420px] lg:border-r lg:flex flex-col overflow-y-auto shrink-0 ${
                mobileTab === 'timeline' ? 'hidden lg:flex' : 'flex lg:flex'
              }`}>
                <div className="p-4 sm:p-5 space-y-5">
                  {/* KPIs */}
                  <KPIBar kpis={kpis} />

                  {/* Candidates */}
                  <div className={`${mobileTab !== 'candidates' && mobileTab !== 'details' ? 'hidden lg:block' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {candidatesLabel} ({template?.candidateCount ?? 0})
                      </h3>
                      <button
                        onClick={() => setShowNewCandidate(!showNewCandidate)}
                        className="flex items-center gap-1 text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 px-2 py-1 rounded-lg transition"
                      >
                        <Plus size={12} /> Neu
                      </button>
                    </div>
                    {showNewCandidate && (
                      <div className="bg-gray-50 rounded-xl p-3 mb-2 space-y-2">
                        {/* File Upload */}
                        <div className="relative border-2 border-dashed border-gray-200 rounded-lg p-2 text-center hover:border-tc-blue/50 transition">
                          {cvFile ? (
                            <div className="flex items-center justify-center gap-2 text-xs">
                              {cvFile.name.endsWith('.eml') ? <Mail size={14} className="text-tc-blue" /> : <FileText size={14} className="text-red-400" />}
                              <span className="text-gray-700 truncate max-w-[160px]">{cvFile.name}</span>
                              {extracting && <span className="text-tc-blue animate-pulse">Lese aus…</span>}
                              <button onClick={() => setCvFile(null)} className="text-gray-400 hover:text-red-500 ml-1">✕</button>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">Anschreiben/CV/E-Mail hochladen (optional)</p>
                          )}
                          {!cvFile && (
                            <input type="file" accept="application/pdf,.eml,message/rfc822"
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={newCandidate.firstName} onChange={e => setNewCandidate({ ...newCandidate, firstName: e.target.value })}
                            placeholder="Vorname *" autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') createCandidate(); if (e.key === 'Escape') setShowNewCandidate(false); }}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                          <input value={newCandidate.lastName} onChange={e => setNewCandidate({ ...newCandidate, lastName: e.target.value })}
                            placeholder="Nachname"
                            onKeyDown={e => { if (e.key === 'Enter') createCandidate(); if (e.key === 'Escape') setShowNewCandidate(false); }}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={newCandidate.email} onChange={e => setNewCandidate({ ...newCandidate, email: e.target.value })}
                            placeholder="E-Mail"
                            onKeyDown={e => { if (e.key === 'Enter') createCandidate(); if (e.key === 'Escape') setShowNewCandidate(false); }}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                          <input value={newCandidate.phone} onChange={e => setNewCandidate({ ...newCandidate, phone: e.target.value })}
                            placeholder="Telefon"
                            onKeyDown={e => { if (e.key === 'Enter') createCandidate(); if (e.key === 'Escape') setShowNewCandidate(false); }}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setShowNewCandidate(false); setNewCandidate({ firstName: '', lastName: '', email: '', phone: '' }); setCvFile(null); }}
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Abbrechen</button>
                          <button onClick={createCandidate} disabled={creatingCandidate || !newCandidate.firstName.trim()}
                            className="flex items-center gap-1 text-xs bg-tc-dark hover:bg-tc-dark/90 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                            {creatingCandidate ? 'Erstelle…' : 'Anlegen'}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {template?.candidates.length === 0 && !showNewCandidate && (
                        <p className="text-sm text-gray-400 text-center py-4">Keine {candidatesLabel}</p>
                      )}
                      {template?.candidates.map(candidate => (
                        <div
                          key={candidate.id}
                          onClick={() => onOpenLead?.(candidate.id)}
                          className={`flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl ${onOpenLead ? 'cursor-pointer hover:bg-tc-blue/10 transition' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{`${candidate.firstName} ${candidate.lastName}`.trim()}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${TEMP_COLORS[candidate.temperature]}`}>
                                {candidate.score}
                              </span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[candidate.phase]}`}>
                                {PHASE_LABELS[candidate.phase]}
                              </span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${OPP_STAGE_COLORS[candidate.oppStage as keyof typeof OPP_STAGE_COLORS] ?? ''}`}>
                                {OPP_STAGE_LABELS[candidate.oppStage as keyof typeof OPP_STAGE_LABELS] ?? candidate.oppStage}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Restricted notice */}
                  {template?.restricted && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                      <p className="text-sm text-amber-700 font-medium">Eingeschränkter Zugriff</p>
                      <p className="text-xs text-amber-600 mt-1">Du bist dieser {entityLabel} nicht zugewiesen. Kandidaten und Notizen sind nicht sichtbar.</p>
                    </div>
                  )}

                  {/* User Assignment (Admin only) */}
                  {isAdmin && template && (
                    <div className={`${mobileTab !== 'details' ? 'hidden lg:block' : ''}`}>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Zugewiesene Benutzer</h3>
                      <div className="space-y-1">
                        {allUsers.map(u => {
                          const assigned = template.assignedUsers?.some(a => a.id === u.id) ?? false;
                          return (
                            <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                              <input type="checkbox" checked={assigned} onChange={() => toggleUserAssignment(u.id)}
                                className="w-4 h-4 rounded border-gray-300 text-tc-blue" />
                              <span className="text-sm text-gray-700">{u.name}</span>
                              <span className="text-xs text-gray-400">{u.email}</span>
                            </label>
                          );
                        })}
                        {template.assignedUsers?.length === 0 && (
                          <p className="text-xs text-gray-400 py-2">Keine Einschränkung — alle User haben Zugriff</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Details (edit form) */}
                  {isAdmin && (
                    <div className={`${mobileTab !== 'details' ? 'hidden lg:block' : ''}`}>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{entityLabel}-Details</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-500 font-medium">Name</label>
                          <input
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium">Beschreibung / Stellenausschreibung</label>
                          <textarea
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            rows={12}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-y"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium">{isRecruiting ? 'Gehalt' : 'Wert'} (€)</label>
                          <input
                            type="number"
                            value={form.defaultValue}
                            onChange={(e) => setForm({ ...form, defaultValue: e.target.value })}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={saveChanges}
                            disabled={saving}
                            className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                          >
                            <Save size={14} /> {saving ? 'Speichern…' : 'Speichern'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel - Timeline */}
              <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab !== 'timeline' ? 'hidden lg:flex' : 'flex'}`}>
                <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-gray-100">
                  <GroupNoteInput targets={noteTargets} onAddNote={handleAddNote} />
                </div>
                <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
                  <GroupTimeline activities={activities} loading={timelineLoading} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Close Position Dialog */}
      {showCloseDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && !closingInProgress && setShowCloseDialog(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" />
                <h3 className="text-lg font-bold">Stelle schließen</h3>
              </div>
              {!closingInProgress && (
                <button onClick={() => setShowCloseDialog(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-sm text-gray-600">
                <strong>{rejectionCandidates.length}</strong> offene Kandidaten werden abgelehnt und erhalten eine Absage-Mail
                (sofern E-Mail vorhanden):
              </p>

              {closeError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{closeError}</div>
              )}

              {closingInProgress && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between text-sm text-blue-700 mb-2">
                    <span>Verarbeite Absagen…</span>
                    <span>{closeProgress.done}/{closeProgress.total}</span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${(closeProgress.done / closeProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {rejectionCandidates.map((c, idx) => (
                  <div key={c.oppId} className="border border-gray-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{c.candidateName}</span>
                      <span className="text-xs text-gray-400">{c.candidateEmail ?? 'Keine E-Mail'}</span>
                    </div>
                    {c.candidateEmail && (
                      <>
                        <div>
                          <label className="text-[11px] text-gray-500 font-medium">Betreff</label>
                          <input
                            value={c.subject}
                            onChange={(e) => {
                              const updated = [...rejectionCandidates];
                              updated[idx] = { ...updated[idx], subject: e.target.value };
                              setRejectionCandidates(updated);
                            }}
                            disabled={closingInProgress}
                            className="w-full mt-0.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500 font-medium">Nachricht</label>
                          <textarea
                            value={c.body}
                            onChange={(e) => {
                              const updated = [...rejectionCandidates];
                              updated[idx] = { ...updated[idx], body: e.target.value };
                              setRejectionCandidates(updated);
                            }}
                            disabled={closingInProgress}
                            rows={4}
                            className="w-full mt-0.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-y"
                          />
                        </div>
                      </>
                    )}
                    {!c.candidateEmail && (
                      <p className="text-xs text-amber-600">Keine E-Mail-Adresse — wird nur auf Abgelehnt gesetzt, keine Mail</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => { setShowCloseDialog(false); setRejectionCandidates([]); }}
                disabled={closingInProgress}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={executeClosePosition}
                disabled={closingInProgress}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-50"
              >
                <Lock size={14} />
                {closingInProgress
                  ? `${closeProgress.done}/${closeProgress.total}…`
                  : `${rejectionCandidates.length} Absagen senden & schließen`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
