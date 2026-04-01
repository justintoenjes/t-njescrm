'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { ACTIVE_STAGES } from '@/lib/opportunity';
import type {
  LeadFull, NoteData, OpportunityPreview, AttachmentData, Task,
  FollowUp, AISummary, PersistedEmail, EnrichedNote, Activity,
} from './types';
import type { OpportunityFull } from '@/components/OpportunityModal';

type Props = {
  lead: LeadFull;
  onUpdate: (lead: LeadFull) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const CALL_PATTERN = /^(Eingehender|Ausgehender) Anruf/;

export function useLeadDetail({ lead, onUpdate, onDelete, onClose }: Props) {
  const { data: session } = useSession();

  // Form state
  const [form, setForm] = useState({
    name: lead.name,
    companyId: lead.companyId ?? '',
    companyName: lead.companyRef?.name ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    assignedToId: lead.assignedToId ?? '',
    formalAddress: lead.formalAddress ?? false,
  });
  const [saving, setSaving] = useState(false);

  // Notes
  const [leadNotes, setLeadNotes] = useState<NoteData[]>(lead.notes);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [contactMade, setContactMade] = useState(false);

  // Counters
  const [missedCallsCount, setMissedCallsCount] = useState(lead.missedCallsCount);
  const [noShowCount, setNoShowCount] = useState(lead.noShowCount);

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentData[]>(lead.attachments ?? []);

  // AI
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Follow-up
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [followUpNoteId, setFollowUpNoteId] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState('');
  const [copied, setCopied] = useState(false);

  // Opportunities
  const [opportunities, setOpportunities] = useState<OpportunityPreview[]>(lead.opportunities ?? []);
  const [openOppId, setOpenOppId] = useState<string | null>(null);
  const [showNewOppForm, setShowNewOppForm] = useState(false);
  const [newOppTitle, setNewOppTitle] = useState('');
  const [newOppValue, setNewOppValue] = useState('');
  const [newOppTemplateId, setNewOppTemplateId] = useState('');
  const [creatingOpp, setCreatingOpp] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null; defaultValue: number | null }[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Emails
  const [emails, setEmails] = useState<PersistedEmail[]>([]);
  const [emailsLoaded, setEmailsLoaded] = useState(false);
  const [emailsError, setEmailsError] = useState('');
  const [emailsSyncing, setEmailsSyncing] = useState(false);

  // Dial method
  const [dialMethod, setDialMethod] = useState('tel');
  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => { if (d.dialMethod) setDialMethod(d.dialMethod); }).catch(() => {});
  }, []);

  // Load emails: first from DB (GET), then sync from Graph (POST)
  useEffect(() => {
    if (!lead.email || emailsLoaded) return;
    let cancelled = false;
    // Fast: load from DB first, then sync from Graph
    fetch(`/api/leads/${lead.id}/emails`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (!data.error) setEmails(data.emails ?? []);
        setEmailsLoaded(true);
        // Then sync from Graph in background (sequential to avoid race)
        setEmailsSyncing(true);
        return fetch(`/api/leads/${lead.id}/emails`, { method: 'POST' });
      })
      .then(r => r?.json())
      .then(data => {
        if (cancelled || !data) return;
        if (data.error) setEmailsError(data.error);
        else setEmails(data.emails ?? []);
        setEmailsSyncing(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEmailsLoaded(true);
        setEmailsSyncing(false);
      });
    return () => { cancelled = true; };
  }, [lead.id, lead.email, emailsLoaded]);

  // Load templates when needed
  const loadTemplates = useCallback(() => {
    if (!templatesLoaded) {
      fetch(`/api/templates?category=${lead.category}`)
        .then(r => r.json())
        .then(data => { setTemplates(data); setTemplatesLoaded(true); });
    }
  }, [lead.category, templatesLoaded]);

  // Load tasks
  const loadTasks = useCallback(() => {
    if (!tasksLoaded) {
      fetch(`/api/leads/${lead.id}/tasks`)
        .then(r => r.json())
        .then(data => { setTasks(data); setTasksLoaded(true); });
    }
  }, [lead.id, tasksLoaded]);

  // Load tasks on mount
  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Load templates on mount
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Refresh lead data when a call ends
  useEffect(() => {
    function handleCallEnded(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.leadId === lead.id || detail?.externalNumber) {
        fetch(`/api/leads/${lead.id}`)
          .then(r => r.json())
          .then((updated: LeadFull) => {
            setLeadNotes(updated.notes);
            setOpportunities(updated.opportunities);
            onUpdate({ ...updated, notes: updated.notes, opportunities: updated.opportunities });
          });
      }
    }
    window.addEventListener('call-ended', handleCallEnded);
    return () => window.removeEventListener('call-ended', handleCallEnded);
  }, [lead.id, onUpdate]);

  // Merged notes: lead notes + opportunity notes
  const mergedNotes: EnrichedNote[] = [
    ...leadNotes.map(n => ({ ...n, source: { type: 'lead' as const, label: 'Kontakt', id: lead.id } })),
    ...opportunities.flatMap(o =>
      (o.notes ?? []).map(n => ({ ...n, source: { type: 'opportunity' as const, label: o.title, id: o.id } }))
    ),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const moveTargets = [
    { type: 'lead' as const, label: 'Kontakt', id: lead.id },
    ...opportunities.map(o => ({ type: 'opportunity' as const, label: o.title, id: o.id })),
  ];

  // Build unified timeline
  const activities: Activity[] = [
    ...mergedNotes
      .filter(n => !CALL_PATTERN.test(n.content))
      .map(n => ({ type: 'note' as const, id: n.id, date: new Date(n.createdAt), note: n })),
    ...mergedNotes
      .filter(n => CALL_PATTERN.test(n.content))
      .map(n => ({ type: 'call' as const, id: n.id, date: new Date(n.createdAt), note: n })),
    ...emails.map(e => ({ type: 'email' as const, id: e.id, date: new Date(e.date), email: e })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const activeOppCount = opportunities.filter(o => ACTIVE_STAGES.includes(o.stage)).length;
  const isRecruiting = lead.category === 'RECRUITING';

  // ---- HANDLERS ----

  async function saveChanges() {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        companyId: form.companyId || null,
        email: form.email || null,
        phone: form.phone || null,
        assignedToId: form.assignedToId || null,
        formalAddress: form.formalAddress,
      }),
    });
    const updated = await res.json();
    setSaving(false);
    onUpdate({ ...lead, ...updated, notes: leadNotes, opportunities, temperature: updated.temperature ?? lead.temperature, phase: updated.phase ?? lead.phase });
  }

  async function toggleArchived() {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !lead.archived }),
    });
    const updated = await res.json();
    onUpdate({ ...lead, ...updated, notes: leadNotes, opportunities });
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    const res = await fetch(`/api/leads/${lead.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteText.trim(), contactMade }),
    });
    const note = await res.json();
    const currentUser = session?.user ? { id: session.user.id, name: session.user.name ?? '' } : null;
    const newNotes = [{ ...note, author: note.author ?? currentUser }, ...leadNotes];
    setLeadNotes(newNotes);
    setNoteText('');
    setContactMade(false);
    setAddingNote(false);
    if (contactMade) {
      setMissedCallsCount(0);
      setNoShowCount(0);
    }
    const leadRes = await fetch(`/api/leads/${lead.id}`);
    const updatedLead: LeadFull = await leadRes.json();
    setOpportunities(updatedLead.opportunities ?? opportunities);
    onUpdate({ ...updatedLead, notes: newNotes as NoteData[], opportunities: updatedLead.opportunities ?? opportunities });
  }

  async function deleteNote(noteId: string) {
    const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (!res.ok) return;
    setLeadNotes(prev => prev.filter(n => n.id !== noteId));
    // Re-fetch lead to get fresh data
    const leadRes = await fetch(`/api/leads/${lead.id}`);
    if (leadRes.ok) {
      const updated: LeadFull = await leadRes.json();
      setLeadNotes(updated.notes);
      setOpportunities(updated.opportunities);
      onUpdate({ ...updated });
    }
  }

  async function handleMoveNote(noteId: string, target: { leadId?: string; opportunityId?: string }) {
    const res = await fetch(`/api/notes/${noteId}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target),
    });
    if (!res.ok) return;
    const leadRes = await fetch(`/api/leads/${lead.id}`);
    if (leadRes.ok) {
      const updated: LeadFull = await leadRes.json();
      setLeadNotes(updated.notes);
      setOpportunities(updated.opportunities);
      onUpdate({ ...updated, notes: updated.notes, opportunities: updated.opportunities });
    }
  }

  async function triggerAction(action: 'missedCall' | 'noShow') {
    const res = await fetch(`/api/leads/${lead.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (action === 'missedCall') setMissedCallsCount(data.missedCallsCount);
    if (action === 'noShow') setNoShowCount(data.noShowCount);
    const leadRes = await fetch(`/api/leads/${lead.id}`);
    const updatedLead: LeadFull = await leadRes.json();
    onUpdate({ ...updatedLead, notes: leadNotes, opportunities });
  }

  async function fetchAI() {
    setAiLoading(true);
    setAiError('');
    setAiSummary(null);
    const res = await fetch(`/api/leads/${lead.id}/ai-summary`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setAiError(data.error ?? 'Fehler'); }
    else {
      setAiSummary(data);
      const leadRes = await fetch(`/api/leads/${lead.id}`);
      const updatedLead: LeadFull = await leadRes.json();
      onUpdate({ ...updatedLead, notes: leadNotes, opportunities });
    }
    setAiLoading(false);
  }

  async function fetchFollowUp() {
    setFollowUpLoading(true); setFollowUpError(''); setFollowUp(null); setFollowUpNoteId(null);
    const res = await fetch(`/api/leads/${lead.id}/follow-up`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setFollowUpError(data.error ?? 'Fehler'); }
    else {
      setFollowUp(data);
      if (data.note) {
        setFollowUpNoteId(data.note.id);
        setLeadNotes(prev => [data.note, ...prev]);
      }
    }
    setFollowUpLoading(false);
  }

  async function discardFollowUp() {
    if (followUpNoteId) {
      await fetch(`/api/notes/${followUpNoteId}`, { method: 'DELETE' });
      setLeadNotes(prev => prev.filter(n => n.id !== followUpNoteId));
    }
    setFollowUp(null);
    setFollowUpNoteId(null);
    setFollowUpError('');
  }

  async function sendFollowUp() {
    if (!followUp || !lead.email) return;
    const res = await fetch('/api/emails/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: lead.email, subject: followUp.subject, bodyText: followUp.body }),
    });
    const data = await res.json();
    if (res.ok) {
      setFollowUp(null);
      setFollowUpNoteId(null);
      setFollowUpError('');
      alert('E-Mail gesendet!');
    } else {
      setFollowUpError(data.error ?? 'Senden fehlgeschlagen');
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

  function handleTemplateSelect(templateId: string) {
    setNewOppTemplateId(templateId);
    if (templateId) {
      const t = templates.find(t => t.id === templateId);
      if (t) {
        setNewOppTitle(t.name);
        setNewOppValue(t.defaultValue != null ? String(t.defaultValue) : '');
      }
    }
  }

  async function createOpportunity() {
    if (!newOppTitle.trim()) return;
    setCreatingOpp(true);
    const res = await fetch('/api/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newOppTitle.trim(),
        leadId: lead.id,
        value: newOppValue ? parseFloat(newOppValue) : null,
        templateId: newOppTemplateId || null,
        stage: isRecruiting ? 'SCREENING' : 'PROPOSAL',
      }),
    });
    const opp: OpportunityFull = await res.json();
    const preview: OpportunityPreview = {
      id: opp.id, title: opp.title, stage: opp.stage,
      value: opp.value, score: opp.score, scoreBreakdown: opp.scoreBreakdown,
      temperature: opp.temperature, expectedCloseDate: opp.expectedCloseDate,
    };
    setOpportunities(prev => [...prev, preview]);
    setNewOppTitle(''); setNewOppValue(''); setNewOppTemplateId(''); setShowNewOppForm(false); setCreatingOpp(false);
    const leadRes = await fetch(`/api/leads/${lead.id}`);
    const updatedLead: LeadFull = await leadRes.json();
    onUpdate({ ...updatedLead, notes: leadNotes, opportunities: [...opportunities, preview] });
    setOpenOppId(opp.id);
  }

  function handleOppUpdate(updated: OpportunityFull) {
    const preview: OpportunityPreview = {
      id: updated.id, title: updated.title, stage: updated.stage,
      value: updated.value, score: updated.score, scoreBreakdown: updated.scoreBreakdown,
      temperature: updated.temperature, expectedCloseDate: updated.expectedCloseDate,
    };
    const newOpps = opportunities.map(o => o.id === updated.id ? preview : o);
    setOpportunities(newOpps);
    onUpdate({ ...lead, notes: leadNotes, opportunities: newOpps });
  }

  function handleOppDelete(id: string) {
    const newOpps = opportunities.filter(o => o.id !== id);
    setOpportunities(newOpps);
    setOpenOppId(null);
    onUpdate({ ...lead, notes: leadNotes, opportunities: newOpps });
  }

  async function addTask() {
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    const res = await fetch(`/api/leads/${lead.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTaskTitle.trim(), dueDate: newTaskDue || null }),
    });
    const task = await res.json();
    setTasks(prev => [...prev, task]);
    setNewTaskTitle(''); setNewTaskDue(''); setAddingTask(false);
    setMissedCallsCount(0); setNoShowCount(0);
  }

  async function toggleTask(taskId: string, isCompleted: boolean) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isCompleted } : t));
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted }),
    });
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  async function deleteLead() {
    if (!confirm(`Lead "${lead.name}" wirklich löschen?`)) return;
    await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
    onDelete(lead.id);
    onClose();
  }

  return {
    // Form
    form, setForm, saving, saveChanges,
    // Notes
    leadNotes, noteText, setNoteText, addingNote, contactMade, setContactMade,
    addNote, deleteNote, handleMoveNote, mergedNotes, moveTargets,
    // Counters
    missedCallsCount, noShowCount, triggerAction,
    // Attachments
    attachments, setAttachments,
    // AI
    aiSummary, aiLoading, aiError, fetchAI,
    // Follow-up
    followUp, setFollowUp, followUpNoteId, followUpLoading, followUpError,
    fetchFollowUp, discardFollowUp, sendFollowUp, copied, copyToClipboard,
    // Opportunities
    opportunities, openOppId, setOpenOppId, showNewOppForm, setShowNewOppForm,
    newOppTitle, setNewOppTitle, newOppValue, setNewOppValue,
    newOppTemplateId, handleTemplateSelect, creatingOpp, createOpportunity,
    templates, handleOppUpdate, handleOppDelete,
    // Tasks
    tasks, tasksLoaded, newTaskTitle, setNewTaskTitle, newTaskDue, setNewTaskDue,
    addingTask, addTask, toggleTask, deleteTask, showCompleted, setShowCompleted,
    // Emails
    emails, emailsLoaded, emailsError, emailsSyncing,
    // Computed
    activities, activeOppCount, isRecruiting,
    // Actions
    toggleArchived, deleteLead, dialMethod,
  };
}

export type UseLeadDetailReturn = ReturnType<typeof useLeadDetail>;
