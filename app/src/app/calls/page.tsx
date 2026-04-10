'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, User, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import LeadModal, { LeadFull } from '@/components/LeadModal';

type CallLogEntry = {
  id: string;
  direction: string;
  externalNumber: string;
  duration: number;
  answered: boolean;
  seen: boolean;
  timestamp: string;
  lead: { id: string; firstName: string; lastName: string; companyRef?: { name: string } | null } | null;
};

type Filter = 'all' | 'missed' | 'incoming' | 'outgoing';

const FILTERS: { key: Filter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'Alle', icon: <Phone size={14} /> },
  { key: 'missed', label: 'Verpasst', icon: <PhoneMissed size={14} /> },
  { key: 'incoming', label: 'Eingehend', icon: <PhoneIncoming size={14} /> },
  { key: 'outgoing', label: 'Ausgehend', icon: <PhoneOutgoing size={14} /> },
];

function formatDuration(seconds: number): string {
  if (seconds === 0) return '–';
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function formatTimestamp(ts: string): { date: string; time: string } {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return { date: 'Heute', time };
  if (isYesterday) return { date: 'Gestern', time };
  return { date: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }), time };
}

function CallRow({ call, onOpenLead }: { call: CallLogEntry; onOpenLead: (id: string) => void }) {
  const { date, time } = formatTimestamp(call.timestamp);
  const isMissed = !call.answered && call.direction === 'incoming';
  const leadName = call.lead
    ? [call.lead.lastName, call.lead.firstName].filter(Boolean).join(', ')
    : null;

  return (
    <div className={`flex items-center gap-3 py-3 px-4 hover:bg-gray-50 transition ${!call.seen ? 'bg-tc-blue/5' : ''}`}>
      {/* Icon */}
      <div className={`p-2 rounded-full shrink-0 ${
        isMissed ? 'bg-red-100' :
        call.direction === 'incoming' ? 'bg-green-100' :
        'bg-blue-100'
      }`}>
        {isMissed ? <PhoneMissed size={16} className="text-red-500" /> :
         call.direction === 'incoming' ? <PhoneIncoming size={16} className="text-green-600" /> :
         <PhoneOutgoing size={16} className="text-blue-600" />}
      </div>

      {/* Name / Number */}
      <div className="flex-1 min-w-0">
        {leadName ? (
          <>
            <button
              onClick={() => onOpenLead(call.lead!.id)}
              className={`text-sm font-medium hover:underline transition ${isMissed ? 'text-red-700' : 'text-gray-900'}`}
            >
              {leadName}
            </button>
            {call.lead?.companyRef?.name && (
              <span className="text-xs text-gray-400 ml-2">{call.lead.companyRef.name}</span>
            )}
            <p className="text-xs text-gray-400">{call.externalNumber}</p>
          </>
        ) : (
          <p className={`text-sm font-medium ${isMissed ? 'text-red-700' : 'text-gray-900'}`}>
            {call.externalNumber}
          </p>
        )}
      </div>

      {/* Duration */}
      <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
        <Clock size={12} />
        {formatDuration(call.duration)}
      </div>

      {/* Time */}
      <div className="text-right shrink-0 w-20">
        <p className="text-xs text-gray-500">{date}</p>
        <p className="text-xs text-gray-400">{time}</p>
      </div>
    </div>
  );
}

export default function CallsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'ADMIN';
  const [calls, setCalls] = useState<CallLogEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unseenCount, setUnseenCount] = useState(0);
  const [selectedLead, setSelectedLead] = useState<LeadFull | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('filter', filter);
    params.set('page', String(page));
    const res = await fetch(`/api/calls/log?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCalls(data.calls);
      setPages(data.pages);
      setTotal(data.total);
      setUnseenCount(data.unseenCount);
    }
  }, [filter, page]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated') {
      load();
      if (isAdmin) fetch('/api/users').then(r => r.json()).then(setUsers);
    }
  }, [status, router, load, isAdmin]);

  // Mark unseen calls as seen when viewing missed filter
  useEffect(() => {
    if (filter === 'missed' && unseenCount > 0) {
      fetch('/api/calls/log', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: 'all' }),
      }).then(() => {
        setUnseenCount(0);
        // Notify header to refresh badge
        window.dispatchEvent(new Event('calls-seen'));
      });
    }
  }, [filter, unseenCount]);

  async function openLead(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}`);
    if (res.ok) setSelectedLead(await res.json());
  }

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Anrufe</h1>
          <span className="text-sm text-gray-400">{total} Anrufe</span>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 mb-4 bg-white rounded-lg border border-gray-200 p-1 w-fit">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${filter === f.key ? 'bg-tc-dark text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {f.icon}
              {f.label}
              {f.key === 'missed' && unseenCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {unseenCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Call List */}
        {calls.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {calls.map(call => (
              <CallRow key={call.id} call={call} onOpenLead={openLead} />
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-16">
            <Phone size={32} className="mx-auto mb-3 opacity-40" />
            <p>Keine Anrufe vorhanden</p>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-500">
              Seite {page} von {pages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
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
    </div>
  );
}
