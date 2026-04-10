'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, CheckCircle2, Circle, Calendar, User, Link, Save, Bell } from 'lucide-react';
import { useCategory } from '@/lib/category-context';

export type TaskFull = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  createdAt: string;
  assignedToId?: string | null;
  lead: { id: string; firstName: string; lastName: string } | null;
  opportunity: { id: string; title: string; lead: { id: string; firstName: string; lastName: string } } | null;
  assignedTo: { id: string; name: string } | null;
};

type Props = {
  taskId?: string | null;
  // For create mode — pre-link to a lead or opportunity
  defaultLeadId?: string | null;
  defaultOpportunityId?: string | null;
  users: { id: string; name: string; email?: string }[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved?: (task: TaskFull) => void;
  onDeleted?: (taskId: string) => void;
  onOpenLead?: (leadId: string) => void;
  onOpenOpportunity?: (oppId: string) => void;
};

export default function TaskModal({
  taskId,
  defaultLeadId,
  defaultOpportunityId,
  users,
  isAdmin,
  onClose,
  onSaved,
  onDeleted,
  onOpenLead,
  onOpenOpportunity,
}: Props) {
  const isCreate = !taskId;
  const { category } = useCategory();
  const oppLabel = category === 'RECRUITING' ? 'Bewerbung' : 'Anfrage';
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [task, setTask] = useState<TaskFull | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState<number>(15);
  const [linkType, setLinkType] = useState<'none' | 'lead' | 'opportunity'>('none');
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<{ id: string; label: string }[]>([]);
  const [linkedLead, setLinkedLead] = useState<{ id: string; label: string } | null>(null);
  const [linkedOpp, setLinkedOpp] = useState<{ id: string; label: string } | null>(null);

  // Load existing task
  useEffect(() => {
    if (!taskId) return;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        const data: TaskFull = await res.json();
        setTask(data);
        setTitle(data.title);
        setDescription(data.description || '');
        setDueDate(data.dueDate ? data.dueDate.slice(0, 10) : '');
        setReminderMinutes((data as any).reminderMinutes ?? 15);
        setAssignedToId(data.assignedTo?.id || '');
        setIsCompleted(data.isCompleted);
        if (data.opportunity) {
          setLinkType('opportunity');
          setLinkedOpp({ id: data.opportunity.id, label: data.opportunity.title });
        } else if (data.lead) {
          setLinkType('lead');
          setLinkedLead({ id: data.lead.id, label: `${data.lead.firstName} ${data.lead.lastName}`.trim() });
        }
      }
      setLoading(false);
    })();
  }, [taskId]);

  // Set defaults for create mode
  useEffect(() => {
    if (!isCreate) return;
    if (defaultOpportunityId) {
      setLinkType('opportunity');
      setLinkedOpp({ id: defaultOpportunityId, label: '' });
      // Fetch opp title
      fetch(`/api/opportunities/${defaultOpportunityId}`).then(r => r.json()).then(data => {
        if (data.title) setLinkedOpp({ id: defaultOpportunityId, label: data.title });
      }).catch(() => {});
    } else if (defaultLeadId) {
      setLinkType('lead');
      setLinkedLead({ id: defaultLeadId, label: '' });
      fetch(`/api/leads/${defaultLeadId}`).then(r => r.json()).then(data => {
        if (data.firstName) setLinkedLead({ id: defaultLeadId, label: `${data.firstName} ${data.lastName}`.trim() });
      }).catch(() => {});
    }
  }, [isCreate, defaultLeadId, defaultOpportunityId]);

  // Link search
  useEffect(() => {
    if (!linkSearch || linkSearch.length < 2) { setLinkResults([]); return; }
    const t = setTimeout(async () => {
      if (linkType === 'lead') {
        const res = await fetch(`/api/leads?search=${encodeURIComponent(linkSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setLinkResults(data.slice(0, 8).map((l: any) => ({
            id: l.id,
            label: `${l.firstName} ${l.lastName}`.trim() + (l.companyRef?.name ? ` · ${l.companyRef.name}` : ''),
          })));
        }
      } else if (linkType === 'opportunity') {
        const res = await fetch(`/api/opportunities?search=${encodeURIComponent(linkSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setLinkResults(data.slice(0, 8).map((o: any) => ({
            id: o.id,
            label: `${o.title} (${o.lead?.firstName ?? ''} ${o.lead?.lastName ?? ''}`.trim() + ')',
          })));
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [linkSearch, linkType]);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        dueDate: dueDate || null,
        reminderMinutes: dueDate ? reminderMinutes : null,
        isCompleted,
      };
      if (isAdmin) payload.assignedToId = assignedToId || null;

      if (isCreate) {
        if (linkedOpp) payload.opportunityId = linkedOpp.id;
        else if (linkedLead) payload.leadId = linkedLead.id;

        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          onSaved?.(created);
          onClose();
        }
      } else {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          onSaved?.(updated);
          onClose();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!taskId || !confirm('Aufgabe wirklich löschen?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        onDeleted?.(taskId);
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }

  function toggleCompleted() {
    setIsCompleted(!isCompleted);
  }

  const hasChanges = isCreate || (task && (
    title !== task.title ||
    (description || '') !== (task.description || '') ||
    (dueDate || '') !== (task.dueDate?.slice(0, 10) || '') ||
    isCompleted !== task.isCompleted ||
    (assignedToId || '') !== (task.assignedTo?.id || '')
  ));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isCreate ? 'Neue Aufgabe' : 'Aufgabe'}
          </h2>
          <div className="flex items-center gap-2">
            {!isCreate && (
              <button onClick={handleDelete} disabled={deleting}
                className="p-1.5 text-gray-400 hover:text-red-500 transition" title="Löschen">
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition">
              <X size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Laden…</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Completed toggle + Title */}
            <div className="flex items-start gap-3">
              <button onClick={toggleCompleted} className="mt-1 shrink-0">
                {isCompleted
                  ? <CheckCircle2 size={22} className="text-green-500" />
                  : <Circle size={22} className="text-gray-300 hover:text-green-400 transition" />}
              </button>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Titel der Aufgabe *"
                autoFocus
                className={`flex-1 text-base font-medium border-0 border-b-2 border-gray-200 focus:border-tc-blue focus:outline-none pb-1 ${isCompleted ? 'line-through text-gray-400' : ''}`}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Beschreibung</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Details, Notizen…"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue resize-none"
              />
            </div>

            {/* Due date + Reminder + Assigned */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 font-medium flex items-center gap-1 mb-1">
                  <Calendar size={12} /> Fällig am
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium flex items-center gap-1 mb-1">
                  <Bell size={12} /> Erinnerung
                </label>
                <select
                  value={reminderMinutes}
                  onChange={e => setReminderMinutes(Number(e.target.value))}
                  disabled={!dueDate}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue disabled:opacity-50 disabled:bg-gray-50"
                >
                  <option value={0}>Keine</option>
                  <option value={15}>15 Min vorher</option>
                  <option value={60}>1 Std vorher</option>
                  <option value={1440}>1 Tag vorher</option>
                </select>
              </div>
            </div>
            <div>
              <div>
                <label className="text-xs text-gray-500 font-medium flex items-center gap-1 mb-1">
                  <User size={12} /> Zugewiesen an
                </label>
                {isAdmin ? (
                  <select
                    value={assignedToId}
                    onChange={e => setAssignedToId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                  >
                    <option value="">— Mir selbst —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : (
                  <div className="border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-50">
                    {users.find(u => u.id === assignedToId)?.name || 'Mir selbst'}
                  </div>
                )}
              </div>
            </div>

            {/* Linked entity */}
            <div>
              <label className="text-xs text-gray-500 font-medium flex items-center gap-1 mb-1">
                <Link size={12} /> Verknüpft mit
              </label>
              {isCreate ? (
                <>
                  {!linkedLead && !linkedOpp ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setLinkType('lead'); setLinkedOpp(null); }}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition ${linkType === 'lead' ? 'bg-tc-blue/10 border-tc-blue text-tc-blue' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >Kontakt</button>
                        <button
                          onClick={() => { setLinkType('opportunity'); setLinkedLead(null); }}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition ${linkType === 'opportunity' ? 'bg-tc-blue/10 border-tc-blue text-tc-blue' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >{oppLabel}</button>
                        <button
                          onClick={() => { setLinkType('none'); setLinkedLead(null); setLinkedOpp(null); setLinkSearch(''); setLinkResults([]); }}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition ${linkType === 'none' ? 'bg-gray-100 border-gray-300 text-gray-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >Keine</button>
                      </div>
                      {linkType !== 'none' && (
                        <div className="relative">
                          <input
                            value={linkSearch}
                            onChange={e => setLinkSearch(e.target.value)}
                            placeholder={linkType === 'lead' ? 'Kontakt suchen…' : `${oppLabel} suchen…`}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                          />
                          {linkResults.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                              {linkResults.map(r => (
                                <button
                                  key={r.id}
                                  onClick={() => {
                                    if (linkType === 'lead') setLinkedLead(r);
                                    else setLinkedOpp(r);
                                    setLinkSearch(''); setLinkResults([]);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 truncate"
                                >{r.label}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50">
                      <span className="flex-1 text-gray-700">
                        {linkedOpp ? `${oppLabel}: ${linkedOpp.label}` : `Kontakt: ${linkedLead?.label}`}
                      </span>
                      <button
                        onClick={() => { setLinkedLead(null); setLinkedOpp(null); setLinkType('none'); }}
                        className="text-gray-400 hover:text-gray-600"
                      ><X size={14} /></button>
                    </div>
                  )}
                </>
              ) : (
                /* Edit mode: show linked entity as clickable link */
                <div className="text-sm">
                  {task?.opportunity ? (
                    <button
                      onClick={() => onOpenOpportunity?.(task.opportunity!.id)}
                      className="text-tc-blue hover:underline"
                    >
                      {task.opportunity.title} ({`${task.opportunity.lead.firstName} ${task.opportunity.lead.lastName}`.trim()})
                    </button>
                  ) : task?.lead ? (
                    <button
                      onClick={() => onOpenLead?.(task.lead!.id)}
                      className="text-tc-blue hover:underline"
                    >
                      {`${task.lead.firstName} ${task.lead.lastName}`.trim()}
                    </button>
                  ) : (
                    <span className="text-gray-400">Keine Verknüpfung</span>
                  )}
                </div>
              )}
            </div>

            {/* Metadata */}
            {!isCreate && task && (
              <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                Erstellt am {new Date(task.createdAt).toLocaleDateString('de-DE')}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!loading && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !hasChanges}
              className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Speichere…' : isCreate ? 'Anlegen' : 'Speichern'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
