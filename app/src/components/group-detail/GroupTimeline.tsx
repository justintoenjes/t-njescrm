'use client';

import { useState } from 'react';
import { Mail, Phone, Paperclip } from 'lucide-react';
import { NoteContent } from '@/components/NoteContent';
import type { GroupActivity, GroupNote, GroupEmail, TimelineFilter } from './types';

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'notes', label: 'Notizen' },
  { key: 'emails', label: 'E-Mails' },
  { key: 'calls', label: 'Anrufe' },
];

function formatDate(d: string | null) {
  if (!d) return '–';
  return new Date(d).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function NoteEntry({ note }: { note: GroupNote }) {
  return (
    <div className={`group relative rounded-lg px-4 py-3 ${note.isAiGenerated ? 'bg-tc-blue/10 border border-tc-blue/20' : 'bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {note.contextLabel && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 truncate max-w-[150px]">
            {note.contextLabel}
          </span>
        )}
        {note.source.type === 'opportunity' && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 truncate max-w-[150px]">
            {note.source.label}
          </span>
        )}
        {note.isAiGenerated && (
          <span className="text-[11px] font-semibold text-tc-blue uppercase tracking-wide">KI</span>
        )}
      </div>
      <NoteContent content={note.content} />
      <p className="text-xs text-gray-400 mt-1.5">
        {note.author?.name && <span className="font-medium text-gray-500">{note.author.name} · </span>}
        {formatDate(note.createdAt)}
      </p>
    </div>
  );
}

function EmailEntry({ email }: { email: GroupEmail }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailBody, setEmailBody] = useState<string | null>(null);
  const [emailBodyLoading, setEmailBodyLoading] = useState(false);
  const isIncoming = email.direction === 'INBOUND';

  async function loadEmailBody() {
    if (emailOpen) { setEmailOpen(false); setEmailBody(null); return; }
    setEmailOpen(true);
    setEmailBody(null);
    setEmailBodyLoading(true);
    const res = await fetch(`/api/emails/${email.graphMessageId}`);
    if (res.ok) {
      const data = await res.json();
      setEmailBody(data.bodyHtml);
    }
    setEmailBodyLoading(false);
  }

  return (
    <>
      <button
        onClick={loadEmailBody}
        className={`w-full text-left rounded-lg px-4 py-3 transition hover:bg-gray-50 ${emailOpen ? 'bg-tc-blue/5 border border-tc-blue/20' : 'bg-gray-50'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {email.contextLabel && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 mr-2">
                {email.contextLabel}
              </span>
            )}
            <p className={`text-sm truncate ${!email.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
              {email.subject || '(Kein Betreff)'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isIncoming ? `Von ${email.from ?? email.fromEmail}` : `An ${email.to}`}
            </p>
            {!emailOpen && (
              <p className="text-xs text-gray-400 mt-1 truncate">{email.preview}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {email.hasAttachments && <Paperclip size={11} className="text-gray-400" />}
            <span className="text-[11px] text-gray-400">
              {new Date(email.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </span>
          </div>
        </div>
      </button>
      {emailOpen && (
        <div className="mt-1 p-4 bg-white border border-gray-200 rounded-lg">
          {emailBodyLoading ? (
            <p className="text-sm text-gray-400">Lade...</p>
          ) : emailBody ? (
            <div
              className="text-sm text-gray-700 prose prose-sm max-w-none overflow-auto max-h-80"
              dangerouslySetInnerHTML={{ __html: emailBody }}
            />
          ) : (
            <p className="text-sm text-gray-400">E-Mail konnte nicht geladen werden</p>
          )}
        </div>
      )}
    </>
  );
}

const CALL_PATTERN = /^(Eingehender|Ausgehender) Anruf/;

type Props = {
  activities: GroupActivity[];
  loading?: boolean;
};

export default function GroupTimeline({ activities, loading }: Props) {
  const [filter, setFilter] = useState<TimelineFilter>('all');

  const filtered = filter === 'all'
    ? activities
    : activities.filter(a => {
        if (filter === 'notes') return a.type === 'note';
        if (filter === 'emails') return a.type === 'email';
        if (filter === 'calls') return a.type === 'call';
        return true;
      });

  const counts = {
    all: activities.length,
    notes: activities.filter(a => a.type === 'note').length,
    emails: activities.filter(a => a.type === 'email').length,
    calls: activities.filter(a => a.type === 'call').length,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition
              ${filter === f.key
                ? 'bg-tc-dark text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`ml-1.5 ${filter === f.key ? 'text-white/70' : 'text-gray-400'}`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-sm text-gray-400 text-center py-8">Laden…</p>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Keine Aktivitäten</p>
      )}

      <div className="space-y-0">
        {filtered.map((activity) => {
          if (activity.type === 'note') {
            return (
              <div key={`note-${activity.id}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-sm">📝</span>
                  </div>
                  <div className="w-px flex-1 bg-gray-100 mt-1" />
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  <NoteEntry note={activity.note} />
                </div>
              </div>
            );
          }

          if (activity.type === 'call') {
            const isMissed = activity.note.content.includes('(0:00 min)') || activity.note.content.includes('Verpasster');
            return (
              <div key={`call-${activity.id}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isMissed ? 'bg-amber-100' : 'bg-green-100'}`}>
                    <Phone size={14} className={isMissed ? 'text-amber-600' : 'text-green-600'} />
                  </div>
                  <div className="w-px flex-1 bg-gray-100 mt-1" />
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  <NoteEntry note={activity.note} />
                </div>
              </div>
            );
          }

          if (activity.type === 'email') {
            const isIncoming = activity.email.direction === 'INBOUND';
            return (
              <div key={`email-${activity.id}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isIncoming ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <Mail size={14} className={isIncoming ? 'text-blue-600' : 'text-gray-500'} />
                  </div>
                  <div className="w-px flex-1 bg-gray-100 mt-1" />
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  <EmailEntry email={activity.email} />
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

export { CALL_PATTERN };
