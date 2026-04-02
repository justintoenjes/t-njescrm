'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { X, Send, Trash2, Save, Brain, Plus, Trash, CheckSquare, ArrowLeft, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { TEMP_COLORS, Temperature } from '@/lib/temperature';
import { OPP_STAGE_LABELS, OPP_STAGE_ORDER, OPP_STAGE_COLORS, OpportunityStage, getStageOrder } from '@/lib/opportunity';
import type { OppScoreBreakdown } from '@/lib/opp-score';
import { NoteContent } from '@/components/NoteContent';
import NoteCard from '@/components/NoteCard';
import OppScoreBreakdownPopover from './OppScoreBreakdown';
import AttachmentSection from './AttachmentSection';

type AttachmentData = { id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string; uploadedBy: { id: string; name: string } | null };
type Note = { id: string; content: string; isAiGenerated?: boolean; createdAt: string; author: { id: string; name: string } | null };
type Task = { id: string; title: string; dueDate: string | null; isCompleted: boolean; assignedTo?: { id: string; name: string } | null };
type UserOption = { id: string; name: string; email: string };

export type OpportunityFull = {
  id: string;
  title: string;
  stage: OpportunityStage;
  hasIdentifiedNeed: boolean;
  isClosingReady: boolean;
  value: number | null;
  expectedCloseDate: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  temperature: Temperature;
  score?: number;
  scoreBreakdown?: OppScoreBreakdown;
  leadId: string;
  lead: { id: string; name: string; email?: string | null; category?: string; companyRef?: { id: string; name: string } | null };
  assignedToId: string | null;
  assignedTo: { id: string; name: string } | null;
  notes: Note[];
  tasks?: Task[];
  attachments?: AttachmentData[];
};

type AISummary = {
  summary: string; sentiment: string; sentimentEmoji: string;
  sentimentExplanation: string; sentimentScore: number;
  nextAction: string; temperatureSuggestion?: 'warm' | 'hot' | null;
  temperatureSuggestionReason?: string | null;
};
type FollowUp = { subject: string; body: string };
type Tab = 'details' | 'notes' | 'tasks';

type Props = {
  opportunityId: string;
  users: UserOption[];
  isAdmin: boolean;
  onClose: () => void;
  onUpdate: (opp: OpportunityFull) => void;
  onDelete: (id: string) => void;
  showBack?: boolean;
  siblingOpportunities?: { id: string; title: string }[];
};

export default function OpportunityModal({ opportunityId, users, isAdmin, onClose, onUpdate, onDelete, showBack, siblingOpportunities }: Props) {
  const { data: session } = useSession();
  const [opp, setOpp] = useState<OpportunityFull | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [tab, setTab] = useState<Tab>('details');
  const [form, setForm] = useState({ title: '', stage: 'PROPOSAL' as OpportunityStage, value: '', expectedCloseDate: '', assignedToId: '' });
  const [hasIdentifiedNeed, setHasIdentifiedNeed] = useState(false);
  const [isClosingReady, setIsClosingReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [contactMade, setContactMade] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [followUpNoteId, setFollowUpNoteId] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState('');
  const [copied, setCopied] = useState(false);
  const [rejectionDraft, setRejectionDraft] = useState<{ subject: string; body: string } | null>(null);
  const [rejectionSending, setRejectionSending] = useState(false);
  const [rejectionError, setRejectionError] = useState('');
  const [interviewDraft, setInterviewDraft] = useState<{ subject: string; body: string } | null>(null);
  const [interviewSending, setInterviewSending] = useState(false);
  const [interviewError, setInterviewError] = useState('');
  const [screeningDraft, setScreeningDraft] = useState<{ subject: string; body: string } | null>(null);
  const [screeningSending, setScreeningSending] = useState(false);
  const [screeningError, setScreeningError] = useState('');
  const screeningShownRef = useRef(false);

  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}`)
      .then(r => r.json())
      .then(async (data: OpportunityFull) => {
        setOpp(data);
        setForm({
          title: data.title,
          stage: data.stage,
          value: data.value != null ? String(data.value) : '',
          expectedCloseDate: data.expectedCloseDate ? data.expectedCloseDate.slice(0, 10) : '',
          assignedToId: data.assignedToId ?? '',
        });
        setHasIdentifiedNeed(data.hasIdentifiedNeed);
        setIsClosingReady(data.isClosingReady);
        setNotes(data.notes);
        setAttachments(data.attachments ?? []);

        // Show screening confirmation for newly created recruiting opps (only once)
        if (data.stage === 'SCREENING' && data.lead.category === 'RECRUITING' && data.notes.length === 0 && !screeningShownRef.current) {
          screeningShownRef.current = true;
          const cfgRes = await fetch('/api/config');
          if (!cfgRes.ok) return;
          const cfg = await cfgRes.json();
          if (cfg.screening_template) {
            const firma = data.lead.companyRef?.name || '';
            const replace = (t: string) => t.replace(/\{\{NAME\}\}/g, data.lead.name).replace(/\{\{JOBTITEL\}\}/g, data.title).replace(/\{\{FIRMA\}\}/g, firma);
            setScreeningError('');
            setScreeningDraft({
              subject: replace(cfg.screening_subject_template || ''),
              body: replace(cfg.screening_template),
            });
          }
        }
      });
  }, [opportunityId]);

  useEffect(() => {
    if (tab === 'tasks' && !tasksLoaded && opp) {
      fetch(`/api/opportunities/${opp.id}/tasks`)
        .then(r => r.json())
        .then(data => { setTasks(data); setTasksLoaded(true); });
    }
  }, [tab, opp, tasksLoaded]);

  async function doSave() {
    if (!opp) return;
    setSaving(true);
    const res = await fetch(`/api/opportunities/${opp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        value: form.value ? parseFloat(form.value) : null,
        expectedCloseDate: form.expectedCloseDate || null,
        assignedToId: form.assignedToId || null,
        hasIdentifiedNeed,
        isClosingReady,
      }),
    });
    const updated: OpportunityFull = await res.json();
    setOpp({ ...updated, notes });
    onUpdate({ ...updated, notes });
    setSaving(false);
  }

  async function saveChanges() {
    if (!opp) return;
    if (opp.lead.category !== 'RECRUITING') { doSave(); return; }

    const isNewStage = form.stage !== opp.stage;
    if (!isNewStage) { doSave(); return; }

    // Fetch config once for all intercepts
    const cfgRes = await fetch('/api/config');
    if (!cfgRes.ok) { doSave(); return; }
    const cfg = await cfgRes.json();
    const firma = opp.lead.companyRef?.name || '';
    const replacePlaceholders = (text: string) => text
      .replace(/\{\{NAME\}\}/g, opp.lead.name)
      .replace(/\{\{JOBTITEL\}\}/g, opp.title)
      .replace(/\{\{FIRMA\}\}/g, firma)
      .replace(/\{\{BUCHUNGSLINK\}\}/g, cfg.interview_booking_link || '');

    // Intercept: INTERVIEW
    if (form.stage === 'INTERVIEW' && cfg.interview_template) {
      setInterviewDraft({
        subject: replacePlaceholders(cfg.interview_subject_template || ''),
        body: replacePlaceholders(cfg.interview_template),
      });
      setInterviewError('');
      return;
    }

    // Intercept: REJECTED
    if (form.stage === 'REJECTED' && cfg.rejection_template) {
      setRejectionDraft({
        subject: replacePlaceholders(cfg.rejection_subject_template || ''),
        body: replacePlaceholders(cfg.rejection_template),
      });
      setRejectionError('');
      return;
    }

    doSave();
  }

  async function sendEmail(draft: { subject: string; body: string }, setError: (e: string) => void, setSending: (b: boolean) => void, clearDraft: () => void): Promise<boolean> {
    if (!opp) return false;
    if (!opp.lead.email) { setError('Keine E-Mail-Adresse beim Kontakt hinterlegt'); return false; }
    setSending(true);
    setError('');
    const res = await fetch('/api/emails/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: opp.lead.email, subject: draft.subject, bodyText: draft.body }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Senden fehlgeschlagen');
      setSending(false);
      return false;
    }
    clearDraft();
    setSending(false);
    return true;
  }

  async function sendRejectionAndSave() {
    if (!rejectionDraft) return;
    if (await sendEmail(rejectionDraft, setRejectionError, setRejectionSending, () => setRejectionDraft(null))) doSave();
  }

  function skipRejectionAndSave() {
    setRejectionDraft(null);
    doSave();
  }

  async function sendInterviewAndSave() {
    if (!interviewDraft) return;
    if (await sendEmail(interviewDraft, setInterviewError, setInterviewSending, () => setInterviewDraft(null))) doSave();
  }

  function skipInterviewAndSave() {
    setInterviewDraft(null);
    doSave();
  }

  async function sendScreening() {
    if (!screeningDraft || !opp) return;
    const sent = await sendEmail(screeningDraft, setScreeningError, setScreeningSending, () => setScreeningDraft(null));
    if (sent) {
      // Add marker note so the prompt doesn't show again
      const res = await fetch(`/api/opportunities/${opp.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Eingangsbestätigung gesendet', contactMade: false }),
      });
      if (res.ok) {
        const note = await res.json();
        const currentUser = session?.user ? { id: session.user.id, name: session.user.name ?? '' } : null;
        setNotes(prev => [{ ...note, author: note.author ?? currentUser }, ...prev]);
      }
    }
  }

  function skipScreening() {
    setScreeningDraft(null);
    // Add marker note so the prompt doesn't show again
    if (opp) {
      fetch(`/api/opportunities/${opp.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Eingangsbestätigung übersprungen', contactMade: false }),
      }).then(r => r.ok ? r.json() : null).then(note => {
        if (note) {
          const currentUser = session?.user ? { id: session.user.id, name: session.user.name ?? '' } : null;
          setNotes(prev => [{ ...note, author: note.author ?? currentUser }, ...prev]);
        }
      });
    }
  }

  async function addNote() {
    if (!noteText.trim() || !opp) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/opportunities/${opp.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteText.trim(), contactMade }),
      });
      if (!res.ok) return;
      const note = await res.json();
      const currentUser = session?.user ? { id: session.user.id, name: session.user.name ?? '' } : null;
      const newNotes = [{ ...note, author: note.author ?? currentUser }, ...notes];
      setNotes(newNotes);
      setNoteText('');
      setContactMade(false);
    } finally {
      setAddingNote(false);
    }
  }

  async function addTask() {
    if (!newTaskTitle.trim() || !opp) return;
    setAddingTask(true);
    const res = await fetch(`/api/opportunities/${opp.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTaskTitle.trim(), dueDate: newTaskDue || null }),
    });
    const task = await res.json();
    setTasks(prev => [...prev, task]);
    setNewTaskTitle('');
    setNewTaskDue('');
    setAddingTask(false);
  }

  async function toggleTask(taskId: string, isCompleted: boolean) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isCompleted } : t));
    await fetch(`/api/tasks/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isCompleted }) });
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  async function deleteOpp() {
    if (!opp || !confirm(`Opportunity "${opp.title}" wirklich löschen?`)) return;
    await fetch(`/api/opportunities/${opp.id}`, { method: 'DELETE' });
    onDelete(opp.id);
    onClose();
  }

  async function fetchAI() {
    if (!opp) return;
    setAiLoading(true); setAiError(''); setAiSummary(null);
    const res = await fetch(`/api/opportunities/${opp.id}/ai-summary`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setAiError(data.error ?? 'Fehler'); }
    else {
      setAiSummary(data);
      // Reload opp to get updated aiSentimentScore in score breakdown
      const oppRes = await fetch(`/api/opportunities/${opp.id}`);
      if (oppRes.ok) {
        const updated = await oppRes.json();
        setOpp(updated);
        onUpdate(updated);
      }
    }
    setAiLoading(false);
  }

  async function fetchFollowUp() {
    if (!opp) return;
    setFollowUpLoading(true); setFollowUpError(''); setFollowUp(null); setFollowUpNoteId(null);
    const res = await fetch(`/api/opportunities/${opp.id}/follow-up`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) setFollowUpError(data.error ?? 'Fehler');
    else {
      setFollowUp(data);
      if (data.note) {
        setFollowUpNoteId(data.note.id);
        setNotes(prev => [data.note, ...prev]);
      }
    }
    setFollowUpLoading(false);
  }

  async function discardFollowUp() {
    if (followUpNoteId) {
      await fetch(`/api/notes/${followUpNoteId}`, { method: 'DELETE' });
      setNotes(prev => prev.filter(n => n.id !== followUpNoteId));
    }
    setFollowUp(null);
    setFollowUpNoteId(null);
    setFollowUpError('');
  }

  async function deleteNote(noteId: string) {
    const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (res.ok) {
      setNotes(prev => prev.filter(n => n.id !== noteId));
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const oppMoveTargets = opp ? [
    { type: 'lead' as const, label: 'Kontakt', id: opp.lead.id },
    ...(siblingOpportunities ?? []).map(o => ({ type: 'opportunity' as const, label: o.title, id: o.id })),
    // Ensure current opp is always in the list
    ...(!siblingOpportunities?.some(o => o.id === opp.id) ? [{ type: 'opportunity' as const, label: opp.title, id: opp.id }] : []),
  ] : [];

  async function handleMoveNote(noteId: string, target: { leadId?: string; opportunityId?: string }) {
    if (!opp) return;
    const res = await fetch(`/api/notes/${noteId}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target),
    });
    if (!res.ok) return;
    // Re-fetch opportunity
    const oppRes = await fetch(`/api/opportunities/${opp.id}`);
    if (oppRes.ok) {
      const updated = await oppRes.json();
      setOpp(updated);
      setNotes(updated.notes);
      onUpdate(updated);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return '–';
    return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'notes', label: `Notizen (${notes.length})` },
    { key: 'tasks', label: 'Aufgaben' },
  ];

  if (!opp) {
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl p-8 text-gray-400">Laden…</div>
      </div>
    );
  }

  const stageColor = OPP_STAGE_COLORS[opp.stage];

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            {showBack && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mr-1">
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-xs text-gray-400">{opp.lead.name}{opp.lead.companyRef?.name ? ` · ${opp.lead.companyRef.name}` : ''}</p>
              <h2 className="text-base font-bold text-gray-900 truncate">{opp.title}</h2>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded-full border shrink-0 ${stageColor}`}>
              {OPP_STAGE_LABELS[opp.stage]}
            </span>
            {opp.scoreBreakdown ? (
              <OppScoreBreakdownPopover
                score={opp.score ?? 0}
                breakdown={opp.scoreBreakdown}
                colorClass={TEMP_COLORS[opp.temperature]}
              >
                <span className={`text-xs font-bold px-2 py-1 rounded-full border shrink-0 ${TEMP_COLORS[opp.temperature]} hover:ring-2 hover:ring-tc-blue/50 transition`}>
                  {opp.score}
                </span>
              </OppScoreBreakdownPopover>
            ) : (
              <span className={`text-xs font-medium px-2 py-1 rounded-full border shrink-0 ${TEMP_COLORS[opp.temperature]}`}>
                {opp.score ?? '–'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button onClick={deleteOpp} className="text-red-400 hover:text-red-600 p-1 rounded">
                <Trash2 size={18} />
              </button>
            )}
            {!showBack && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`py-2.5 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-tc-dark text-tc-dark' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* DETAILS */}
          {tab === 'details' && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium">Titel</label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Stage</label>
                  <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value as OpportunityStage })}
                    disabled={!!interviewDraft || !!rejectionDraft || !!screeningDraft}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue disabled:opacity-50">
                    {getStageOrder(opp.lead.category).map(s => <option key={s} value={s}>{OPP_STAGE_LABELS[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Wert (€)</label>
                  <input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="optional"
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Erwarteter Abschluss</label>
                  <input type="date" value={form.expectedCloseDate} onChange={e => setForm({ ...form, expectedCloseDate: e.target.value })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                </div>
                {isAdmin && (
                  <div>
                    <label className="text-xs text-gray-500 font-medium">Zugewiesen an</label>
                    <select value={form.assignedToId} onChange={e => setForm({ ...form, assignedToId: e.target.value })}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue">
                      <option value="">Nicht zugewiesen</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Deal-Status */}
              <div className="border border-gray-100 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Deal-Status</p>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={hasIdentifiedNeed} onChange={e => setHasIdentifiedNeed(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-tc-blue" />
                  <span className="text-sm text-gray-700">Bedarf / Need identifiziert</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={isClosingReady} onChange={e => setIsClosingReady(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-tc-blue" />
                  <span className="text-sm text-gray-700">Bereit für Closing</span>
                </label>
              </div>

              <AttachmentSection
                attachments={attachments}
                opportunityId={opp.id}
                onChange={setAttachments}
              />

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Erstellt: {formatDate(opp.createdAt)}</span>
                <button onClick={saveChanges} disabled={saving}
                  className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
                  <Save size={14} /> {saving ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </div>
          )}

          {/* NOTES */}
          {tab === 'notes' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-700">Deal-Notizen</h3>
                <div className="flex gap-2">
                  <button onClick={fetchFollowUp} disabled={followUpLoading}
                    className="flex items-center gap-1.5 text-xs bg-tc-blue/10 hover:bg-tc-blue/20 text-tc-dark border border-tc-blue/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40">
                    <Send size={12} /> {followUpLoading ? 'Generiere…' : 'Follow-Up'}
                  </button>
                  <button onClick={fetchAI} disabled={aiLoading || notes.length === 0}
                    className="flex items-center gap-1.5 text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 px-3 py-1.5 rounded-lg transition disabled:opacity-40">
                    <Brain size={13} /> {aiLoading ? 'Analysiere…' : 'KI-Analyse'}
                  </button>
                </div>
              </div>

              {aiError && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{aiError}</div>}
              {aiSummary && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3 text-sm">
                  <div className="space-y-1">
                    {aiSummary.summary.split(' | ').map((p, i) => (
                      <p key={i} className="text-gray-800 flex gap-2"><span className="text-teal-500 font-bold shrink-0">{i + 1}.</span>{p}</p>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-teal-100">
                    <div>
                      <p className="text-teal-700 font-medium text-xs">{aiSummary.sentimentEmoji} {aiSummary.sentiment}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{aiSummary.sentimentExplanation}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400 mb-1">KI-Einschätzung</p>
                      <div className="flex items-center gap-1.5">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${(aiSummary.sentimentScore ?? 5) >= 8 ? 'bg-red-500' : (aiSummary.sentimentScore ?? 5) >= 5 ? 'bg-orange-400' : 'bg-blue-400'}`}
                            style={{ width: `${((aiSummary.sentimentScore ?? 5) / 10) * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-700">{aiSummary.sentimentScore}/10</span>
                      </div>
                    </div>
                  </div>
                  {aiSummary.temperatureSuggestion && (
                    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 border text-xs ${aiSummary.temperatureSuggestion === 'hot' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                      <span className="text-base leading-none">{aiSummary.temperatureSuggestion === 'hot' ? '🔥' : '🌤️'}</span>
                      <div>
                        <p className="font-semibold">KI: Lead auf {aiSummary.temperatureSuggestion === 'hot' ? 'Heiß' : 'Warm'} setzen</p>
                        {aiSummary.temperatureSuggestionReason && <p className="mt-0.5 opacity-80">{aiSummary.temperatureSuggestionReason}</p>}
                      </div>
                    </div>
                  )}
                  <div className="bg-white rounded-lg p-3 border border-teal-100">
                    <p className="text-xs text-gray-500 font-medium mb-1">Nächster Schritt</p>
                    <p className="text-gray-800">{aiSummary.nextAction}</p>
                  </div>
                </div>
              )}

              {followUpError && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{followUpError}</div>}
              {followUp && (
                <div className="bg-tc-blue/10 border border-tc-blue/30 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-tc-dark uppercase tracking-wide">Follow-Up E-Mail</p>
                    <button onClick={() => copyToClipboard(`Betreff: ${followUp.subject}\n\n${followUp.body}`)}
                      className="text-xs text-tc-blue hover:text-tc-dark">{copied ? 'Kopiert!' : 'Kopieren'}</button>
                  </div>
                  <input
                    value={followUp.subject}
                    onChange={e => setFollowUp({ ...followUp, subject: e.target.value })}
                    className="w-full border border-tc-blue/20 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tc-blue"
                    placeholder="Betreff"
                  />
                  <textarea
                    value={followUp.body}
                    onChange={e => setFollowUp({ ...followUp, body: e.target.value })}
                    rows={6}
                    className="w-full border border-tc-blue/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none leading-relaxed"
                  />
                  <div className="flex items-center gap-2">
                    {opp?.lead.email ? (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/emails/send', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ to: opp.lead.email, subject: followUp.subject, bodyText: followUp.body }),
                            });
                            if (res.ok) {
                              setFollowUp(null);
                              setFollowUpNoteId(null);
                              setFollowUpError('');
                              alert('E-Mail gesendet!');
                            } else {
                              const data = await res.json().catch(() => ({}));
                              setFollowUpError(data.error ?? 'Senden fehlgeschlagen');
                            }
                          } catch {
                            setFollowUpError('Verbindungsfehler');
                          }
                        }}
                        className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
                      >
                        <Send size={14} /> An {opp.lead.email} senden
                      </button>
                    ) : (
                      <p className="text-xs text-gray-400">Lead hat keine E-Mail-Adresse</p>
                    )}
                    <button
                      onClick={discardFollowUp}
                      className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:border-red-200 transition"
                    >
                      <X size={14} /> Verwerfen
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) addNote(); }}
                  placeholder="Deal-Notiz… (Strg+Enter)" rows={2}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none" />
                <button onClick={addNote} disabled={addingNote || !noteText.trim()}
                  className="self-end bg-tc-dark hover:bg-tc-dark/90 text-white p-2.5 rounded-lg transition disabled:opacity-50">
                  <Send size={16} />
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={contactMade}
                  onChange={(e) => setContactMade(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-tc-blue focus:ring-tc-blue"
                />
                <span className="text-xs text-gray-600">Kontakt hergestellt</span>
                <span className="text-[11px] text-gray-400">(setzt letzten Kontakt am Lead)</span>
              </label>
              <div className="space-y-2">
                {notes.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Noch keine Notizen</p>}
                {notes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    source={{ type: 'opportunity', label: opp?.title ?? '', id: opp?.id ?? '' }}
                    moveTargets={oppMoveTargets}
                    onMove={handleMoveNote}
                    onDelete={deleteNote}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* TASKS */}
          {tab === 'tasks' && (() => {
            const openTasks = tasks.filter(t => !t.isCompleted);
            const completedTasks = tasks.filter(t => t.isCompleted);
            return (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-700">Deal-Aufgaben</h3>
                {completedTasks.length > 0 && (
                  <span className="text-xs text-gray-400">{completedTasks.length} erledigt</span>
                )}
              </div>
              <div className="flex gap-2">
                <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTask(); }} placeholder="Neue Aufgabe…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
                <button onClick={addTask} disabled={addingTask || !newTaskTitle.trim()}
                  className="bg-tc-dark hover:bg-tc-dark/90 text-white px-3 py-2 rounded-lg transition disabled:opacity-50">
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-1">
                {!tasksLoaded && <p className="text-sm text-gray-400 text-center py-4">Lädt…</p>}
                {tasksLoaded && tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Keine Aufgaben</p>}
                {openTasks.map(task => {
                  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                  return (
                    <div key={task.id} className={`flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                      <button onClick={() => toggleTask(task.id, true)}
                        className="shrink-0 w-4 h-4 rounded border border-gray-300 hover:border-tc-blue flex items-center justify-center transition" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-800 block">{task.title}</span>
                        {task.assignedTo && (
                          <span className="text-[11px] text-gray-400">{task.assignedTo.name}</span>
                        )}
                      </div>
                      {task.dueDate && (
                        <span className={`flex items-center gap-1 text-xs shrink-0 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          {isOverdue && <AlertCircle size={12} />}
                          {new Date(task.dueDate).toLocaleDateString('de-DE')}
                        </span>
                      )}
                      <button onClick={() => deleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition"><Trash size={13} /></button>
                    </div>
                  );
                })}
              </div>
              {completedTasks.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition"
                  >
                    {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {completedTasks.length} erledigt{completedTasks.length !== 1 ? 'e' : 'e'} Aufgabe{completedTasks.length !== 1 ? 'n' : ''}
                  </button>
                  {showCompleted && (
                    <div className="space-y-1 mt-2">
                      {completedTasks.map(task => (
                        <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 opacity-60">
                          <button onClick={() => toggleTask(task.id, false)}
                            className="shrink-0 w-4 h-4 rounded border bg-green-500 border-green-500 text-white flex items-center justify-center transition">
                            <CheckSquare size={10} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm line-through text-gray-400 block">{task.title}</span>
                            {task.assignedTo && (
                              <span className="text-[11px] text-gray-300">{task.assignedTo.name}</span>
                            )}
                          </div>
                          <button onClick={() => deleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition"><Trash size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })()}
        </div>
      </div>

      {/* Screening Confirmation Dialog */}
      {screeningDraft && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && setScreeningDraft(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Eingangsbestätigung senden?</h3>
              <button onClick={() => setScreeningDraft(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Betreff</label>
                <input value={screeningDraft.subject} onChange={e => setScreeningDraft({ ...screeningDraft, subject: e.target.value })}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Text</label>
                <textarea value={screeningDraft.body} onChange={e => setScreeningDraft({ ...screeningDraft, body: e.target.value })}
                  rows={8} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none leading-relaxed" />
              </div>
              {opp?.lead.email && <p className="text-xs text-gray-500">An: <span className="font-medium">{opp.lead.email}</span></p>}
            </div>
            {screeningError && <p className="text-sm text-red-600">{screeningError}</p>}
            <div className="flex items-center gap-2 pt-1">
              {opp?.lead.email ? (
                <button onClick={sendScreening} disabled={screeningSending}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
                  <Send size={14} /> {screeningSending ? 'Senden…' : 'Bestätigung senden'}
                </button>
              ) : (
                <p className="text-xs text-amber-600 font-medium">Keine E-Mail-Adresse hinterlegt</p>
              )}
              <button onClick={skipScreening}
                className="text-gray-500 hover:text-gray-700 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                Überspringen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interview Invitation Dialog */}
      {interviewDraft && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && setInterviewDraft(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Interview-Einladung senden?</h3>
              <button onClick={() => setInterviewDraft(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Betreff</label>
                <input
                  value={interviewDraft.subject}
                  onChange={e => setInterviewDraft({ ...interviewDraft, subject: e.target.value })}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Einladungstext</label>
                <textarea
                  value={interviewDraft.body}
                  onChange={e => setInterviewDraft({ ...interviewDraft, body: e.target.value })}
                  rows={10}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none leading-relaxed"
                />
              </div>
              {opp?.lead.email && (
                <p className="text-xs text-gray-500">An: <span className="font-medium">{opp.lead.email}</span></p>
              )}
            </div>
            {interviewError && <p className="text-sm text-red-600">{interviewError}</p>}
            <div className="flex items-center gap-2 pt-1">
              {opp?.lead.email ? (
                <button
                  onClick={sendInterviewAndSave}
                  disabled={interviewSending}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                >
                  <Send size={14} /> {interviewSending ? 'Senden…' : 'Einladung senden'}
                </button>
              ) : (
                <p className="text-xs text-amber-600 font-medium">Keine E-Mail-Adresse hinterlegt</p>
              )}
              <button
                onClick={skipInterviewAndSave}
                className="text-gray-500 hover:text-gray-700 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
              >
                Ohne Einladung speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Confirmation Dialog */}
      {rejectionDraft && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && setRejectionDraft(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Absage senden?</h3>
              <button onClick={() => setRejectionDraft(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Betreff</label>
                <p className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">{rejectionDraft.subject}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Absagetext</label>
                <div className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">{rejectionDraft.body}</div>
              </div>
              {opp?.lead.email && (
                <p className="text-xs text-gray-500">An: <span className="font-medium">{opp.lead.email}</span></p>
              )}
            </div>
            {rejectionError && <p className="text-sm text-red-600">{rejectionError}</p>}
            <div className="flex items-center gap-2 pt-1">
              {opp?.lead.email ? (
                <button
                  onClick={sendRejectionAndSave}
                  disabled={rejectionSending}
                  className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                >
                  <Send size={14} /> {rejectionSending ? 'Senden…' : 'Absage senden'}
                </button>
              ) : (
                <p className="text-xs text-amber-600 font-medium">Keine E-Mail-Adresse hinterlegt</p>
              )}
              <button
                onClick={skipRejectionAndSave}
                className="text-gray-500 hover:text-gray-700 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
              >
                Ohne Absage ablehnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
