'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, AlertCircle, Clock, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import LeadModal, { LeadFull } from '@/components/LeadModal';
import OpportunityModal from '@/components/OpportunityModal';
import type { OpportunityFull } from '@/components/OpportunityModal';
import { useCategory } from '@/lib/category-context';

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  createdAt: string;
  lead: { id: string; name: string; companyRef?: { id: string; name: string } | null } | null;
  opportunity: { id: string; title: string; lead: { id: string; name: string } } | null;
  assignedTo?: { id: string; name: string };
}

function groupTasks(tasks: Task[]) {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const overdue: Task[] = [];
  const today: Task[] = [];
  const upcoming: Task[] = [];
  const noDate: Task[] = [];
  const completed: Task[] = [];

  for (const t of tasks) {
    if (t.isCompleted) { completed.push(t); continue; }
    if (!t.dueDate) { noDate.push(t); continue; }
    const d = new Date(t.dueDate);
    if (d < now) overdue.push(t);
    else if (d < todayEnd) today.push(t);
    else upcoming.push(t);
  }

  return { overdue, today, upcoming, noDate, completed };
}

function TaskRow({ task, onToggle, onOpenLead, onOpenOpp }: {
  task: Task;
  onToggle: (id: string, val: boolean) => void;
  onOpenLead: (id: string) => void;
  onOpenOpp: (id: string) => void;
}) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due && due < new Date() && !task.isCompleted;

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 hover:bg-gray-50 rounded-lg group">
      <button
        onClick={() => onToggle(task.id, !task.isCompleted)}
        className="mt-0.5 text-gray-300 hover:text-green-500 transition-colors"
      >
        {task.isCompleted
          ? <CheckCircle2 size={18} className="text-green-500" />
          : <Circle size={18} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          {task.opportunity ? (
            <button onClick={() => onOpenOpp(task.opportunity!.id)}
              className="text-xs text-tc-blue hover:text-tc-dark hover:underline transition">
              {task.opportunity.title} ({task.opportunity.lead.name})
            </button>
          ) : task.lead ? (
            <button onClick={() => onOpenLead(task.lead!.id)}
              className="text-xs text-tc-blue hover:text-tc-dark hover:underline transition">
              {task.lead.name}{task.lead.companyRef?.name ? ` · ${task.lead.companyRef.name}` : ''}
            </button>
          ) : (
            <span className="text-xs text-gray-400">–</span>
          )}
          {task.assignedTo && (
            <span className="text-xs text-gray-400">{task.assignedTo.name}</span>
          )}
        </div>
      </div>
      {due && (
        <div className={`flex items-center gap-1 text-xs shrink-0 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
          {isOverdue ? <AlertCircle size={12} /> : <Calendar size={12} />}
          {due.toLocaleDateString('de-DE')}
        </div>
      )}
    </div>
  );
}

function Section({ title, tasks, icon, onToggle, onOpenLead, onOpenOpp, collapsible }: {
  title: string; tasks: Task[]; icon: React.ReactNode;
  onToggle: (id: string, v: boolean) => void;
  onOpenLead: (id: string) => void;
  onOpenOpp: (id: string) => void;
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible ?? false);
  if (tasks.length === 0) return null;
  return (
    <div className="mb-6">
      <button
        onClick={() => collapsible && setCollapsed(!collapsed)}
        className={`flex items-center gap-2 mb-2 px-1 ${collapsible ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      >
        {collapsible && (collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />)}
        {icon}
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <span className="text-xs text-gray-400">({tasks.length})</span>
      </button>
      {!collapsed && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {tasks.map(t => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpenLead={onOpenLead} onOpenOpp={onOpenOpp} />)}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'ADMIN';
  const { category } = useCategory();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadFull | null>(null);
  const [openOppId, setOpenOppId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('category', category);
    const res = await fetch(`/api/tasks?${params}`);
    if (res.ok) setTasks(await res.json());
  }, [category]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated') {
      load();
      if (isAdmin) fetch('/api/users').then(r => r.json()).then(setUsers);
    }
  }, [status, router, load, isAdmin]);

  async function openLead(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}`);
    if (res.ok) setSelectedLead(await res.json());
  }

  async function toggle(id: string, isCompleted: boolean) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, isCompleted } : t));
    await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted }),
    });
  }

  const groups = groupTasks(tasks);

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Aufgaben</h1>

        <Section title="Überfällig" tasks={groups.overdue} icon={<AlertCircle size={15} className="text-red-500" />}
          onToggle={toggle} onOpenLead={openLead} onOpenOpp={setOpenOppId} />
        <Section title="Heute" tasks={groups.today} icon={<Clock size={15} className="text-amber-500" />}
          onToggle={toggle} onOpenLead={openLead} onOpenOpp={setOpenOppId} />
        <Section title="Demnächst" tasks={groups.upcoming} icon={<Calendar size={15} className="text-tc-blue" />}
          onToggle={toggle} onOpenLead={openLead} onOpenOpp={setOpenOppId} />
        <Section title="Kein Fälligkeitsdatum" tasks={groups.noDate} icon={<Circle size={15} className="text-gray-400" />}
          onToggle={toggle} onOpenLead={openLead} onOpenOpp={setOpenOppId} />
        <Section title="Abgeschlossen" tasks={groups.completed} icon={<CheckCircle2 size={15} className="text-green-500" />}
          onToggle={toggle} onOpenLead={openLead} onOpenOpp={setOpenOppId} collapsible />

        {tasks.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            <CheckCircle2 size={32} className="mx-auto mb-3 opacity-40" />
            <p>Keine Aufgaben vorhanden</p>
          </div>
        )}
      </main>

      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          users={users}
          isAdmin={isAdmin}
          onClose={() => { setSelectedLead(null); load(); }}
          onUpdate={(updated) => setSelectedLead(updated)}
          onDelete={() => { setSelectedLead(null); load(); }}
        />
      )}

      {openOppId && (
        <OpportunityModal
          opportunityId={openOppId}
          users={users}
          isAdmin={isAdmin}
          onClose={() => { setOpenOppId(null); load(); }}
          onUpdate={() => {}}
          onDelete={() => { setOpenOppId(null); load(); }}
        />
      )}
    </div>
  );
}
