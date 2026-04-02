'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, DragOverlay, closestCorners,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Header from '@/components/Header';
import OpportunityModal from '@/components/OpportunityModal';
import type { OpportunityFull } from '@/components/OpportunityModal';
import { OPP_STAGE_LABELS, OPP_STAGE_ORDER, OPP_STAGE_COLORS, OpportunityStage, getStageOrder } from '@/lib/opportunity';
import { TEMP_LABELS, TEMP_COLORS, Temperature } from '@/lib/temperature';
import { GripVertical } from 'lucide-react';
import { useCategory } from '@/lib/category-context';

interface OppCard {
  id: string;
  title: string;
  stage: OpportunityStage;
  temperature: Temperature;
  value: number | null;
  lead: { id: string; firstName: string; lastName: string; companyRef?: { id: string; name: string } | null };
  assignedTo?: { id: string; name: string } | null;
}

function CardContent({ opp, overlay = false }: { opp: OppCard; overlay?: boolean }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-3 shadow-sm select-none overflow-hidden
      ${overlay ? 'shadow-lg rotate-1 opacity-90' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-gray-900 truncate">{opp.title}</p>
          <p className="text-xs text-gray-500 truncate">
            {`${opp.lead.firstName} ${opp.lead.lastName}`.trim()}{opp.lead.companyRef?.name ? ` · ${opp.lead.companyRef.name}` : ''}
          </p>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${TEMP_COLORS[opp.temperature]}`}>
          {TEMP_LABELS[opp.temperature]}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2">
        {opp.value != null
          ? <span className="text-xs text-gray-500">{opp.value.toLocaleString('de-DE')} €</span>
          : <span />
        }
        {opp.assignedTo && (
          <span className="text-xs text-gray-400">{opp.assignedTo.name}</span>
        )}
      </div>
    </div>
  );
}

function SortableCard({ opp, onOpen }: { opp: OppCard; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opp.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="min-w-0">
      <div className="flex items-stretch gap-1 min-w-0">
        <div {...listeners} className="flex items-center cursor-grab text-gray-300 hover:text-gray-500 px-0.5 shrink-0">
          <GripVertical size={14} />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(opp.id)}>
          <CardContent opp={opp} />
        </div>
      </div>
    </div>
  );
}

function Column({ stage, opps, onOpen }: { stage: OpportunityStage; opps: OppCard[]; onOpen: (id: string) => void }) {
  const colorClass = OPP_STAGE_COLORS[stage];
  const totalValue = opps.reduce((sum, o) => sum + (o.value ?? 0), 0);

  return (
    <div className="flex flex-col flex-1 min-w-[180px] max-w-[280px]">
      <div className={`rounded-t-lg border px-3 py-2 font-medium text-sm ${colorClass}`}>
        <div className="flex items-center justify-between">
          <span>{OPP_STAGE_LABELS[stage]}</span>
          <span className="text-xs opacity-70">({opps.length})</span>
        </div>
        {totalValue > 0 && (
          <p className="text-xs opacity-60 mt-0.5">{totalValue.toLocaleString('de-DE')} €</p>
        )}
      </div>
      <div className={`flex-1 rounded-b-lg border border-t-0 bg-white/60 p-2 min-h-[120px] space-y-2 overflow-hidden ${colorClass.split(' ').find(c => c.startsWith('border')) ?? ''}`}>
        <SortableContext items={opps.map(o => o.id)} strategy={verticalListSortingStrategy}>
          {opps.map(opp => <SortableCard key={opp.id} opp={opp} onOpen={onOpen} />)}
        </SortableContext>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'ADMIN';
  const { category } = useCategory();
  const [opps, setOpps] = useState<OppCard[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openOppId, setOpenOppId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('category', category);
    const res = await fetch(`/api/opportunities?${params}`);
    if (res.ok) setOpps(await res.json());
  }, [category]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated') {
      load();
      if (isAdmin) fetch('/api/users').then(r => r.json()).then(setUsers);
    }
  }, [status, router, load, isAdmin]);

  const byStage = (stage: OpportunityStage) => opps.filter(o => o.stage === stage);
  const activeOpp = opps.find(o => o.id === activeId);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeStage = opps.find(o => o.id === active.id)?.stage;
    const stages = getStageOrder(category);
    const overStage = stages.includes(over.id as OpportunityStage)
      ? (over.id as OpportunityStage)
      : opps.find(o => o.id === over.id)?.stage;
    if (!activeStage || !overStage || activeStage === overStage) return;
    setOpps(prev => prev.map(o => o.id === active.id ? { ...o, stage: overStage } : o));
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const opp = opps.find(o => o.id === active.id);
    if (!opp) return;
    const res = await fetch(`/api/opportunities/${opp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: opp.stage }),
    });
    if (!res.ok) {
      // Rollback: reload from server
      load();
    }
  }

  function handleOppUpdate(updated: OpportunityFull) {
    setOpps(prev => prev.map(o => o.id === updated.id
      ? { ...o, title: updated.title, stage: updated.stage, value: updated.value, temperature: updated.temperature }
      : o
    ));
  }

  function handleOppDelete(id: string) {
    setOpps(prev => prev.filter(o => o.id !== id));
    setOpenOppId(null);
  }

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Pipeline</h1>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {getStageOrder(category).map(stage => (
              <Column key={stage} stage={stage} opps={byStage(stage)} onOpen={setOpenOppId} />
            ))}
          </div>
          <DragOverlay>
            {activeOpp && <CardContent opp={activeOpp} overlay />}
          </DragOverlay>
        </DndContext>
      </main>

      {openOppId && (
        <OpportunityModal
          opportunityId={openOppId}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setOpenOppId(null)}
          onUpdate={handleOppUpdate}
          onDelete={handleOppDelete}
        />
      )}
    </div>
  );
}
