'use client';

import { Plus, Trash, CheckSquare, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { UseLeadDetailReturn } from './useLeadDetail';

type Props = {
  state: UseLeadDetailReturn;
  collapsed: boolean;
  onToggle: () => void;
};

export default function TasksSection({ state, collapsed, onToggle }: Props) {
  const {
    tasks, tasksLoaded, newTaskTitle, setNewTaskTitle, newTaskDue, setNewTaskDue,
    addingTask, addTask, toggleTask, deleteTask, showCompleted, setShowCompleted,
  } = state;

  const openTasks = tasks.filter(t => !t.isCompleted);
  const completedTasks = tasks.filter(t => t.isCompleted);

  return (
    <div className="border border-gray-100 rounded-xl">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Aufgaben {tasksLoaded ? `(${openTasks.length})` : ''}
        </span>
        {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
              placeholder="Neue Aufgabe…"
              className="min-w-0 flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
            />
            <input
              type="date"
              value={newTaskDue}
              onChange={(e) => setNewTaskDue(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue w-32 shrink-0"
            />
            <button
              onClick={addTask}
              disabled={addingTask || !newTaskTitle.trim()}
              className="bg-tc-dark hover:bg-tc-dark/90 text-white px-3 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="space-y-1">
            {!tasksLoaded && <p className="text-sm text-gray-400 text-center py-4">Lädt…</p>}
            {tasksLoaded && tasks.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Keine Aufgaben</p>
            )}
            {openTasks.map(task => {
              const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
              return (
                <div key={task.id} className={`flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                  <button
                    onClick={() => toggleTask(task.id, true)}
                    className="shrink-0 w-4 h-4 rounded border border-gray-300 hover:border-tc-blue flex items-center justify-center transition"
                  />
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
                  <button onClick={() => deleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition">
                    <Trash size={13} />
                  </button>
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
                      <button
                        onClick={() => toggleTask(task.id, false)}
                        className="shrink-0 w-4 h-4 rounded border bg-green-500 border-green-500 text-white flex items-center justify-center transition"
                      >
                        <CheckSquare size={10} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm line-through text-gray-400 block">{task.title}</span>
                        {task.assignedTo && (
                          <span className="text-[11px] text-gray-300">{task.assignedTo.name}</span>
                        )}
                      </div>
                      <button onClick={() => deleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition">
                        <Trash size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
