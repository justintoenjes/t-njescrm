'use client';

import { useState } from 'react';
import { Phone, Paperclip, EyeOff, Eye } from 'lucide-react';
import NoteCard from '@/components/NoteCard';
import EmailDirectionIcon, { EmailDirectionLabel } from '@/components/EmailDirectionIcon';
import type { Activity, EnrichedNote } from './types';

type Props = {
  activity: Activity;
  moveTargets: { type: 'lead' | 'opportunity'; label: string; id: string }[];
  onMoveNote: (noteId: string, target: { leadId?: string; opportunityId?: string }) => Promise<void>;
  onDeleteNote: (noteId: string) => void;
  onHideEmail?: (emailId: string) => void;
  onUnhideEmail?: (emailId: string) => void;
  formatDate: (date: string) => string;
};

export default function TimelineEntry({ activity, moveTargets, onMoveNote, onDeleteNote, onHideEmail, onUnhideEmail, formatDate }: Props) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailBody, setEmailBody] = useState<string | null>(null);
  const [emailBodyLoading, setEmailBodyLoading] = useState(false);
  const [emailBodyError, setEmailBodyError] = useState<string | null>(null);

  async function loadEmailBody(graphMessageId: string) {
    if (emailOpen) { setEmailOpen(false); setEmailBody(null); setEmailBodyError(null); return; }
    setEmailOpen(true);
    setEmailBody(null);
    setEmailBodyError(null);
    setEmailBodyLoading(true);
    try {
      const res = await fetch(`/api/emails/${graphMessageId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.bodyHtml) setEmailBody(data.bodyHtml);
      else setEmailBodyError(data.error ?? 'E-Mail konnte nicht geladen werden');
    } catch {
      setEmailBodyError('E-Mail konnte nicht geladen werden');
    }
    setEmailBodyLoading(false);
  }

  if (activity.type === 'note') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-sm">📝</span>
          </div>
          <div className="w-px flex-1 bg-gray-100 mt-1" />
        </div>
        <div className="flex-1 pb-4 min-w-0">
          <NoteCard
            note={activity.note}
            source={activity.note.source}
            moveTargets={moveTargets}
            onMove={onMoveNote}
            onDelete={onDeleteNote}
            formatDate={formatDate}
          />
        </div>
      </div>
    );
  }

  if (activity.type === 'call') {
    const isMissed = activity.note.content.includes('(0:00 min)') || activity.note.content.includes('Verpasster');
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isMissed ? 'bg-amber-100' : 'bg-green-100'}`}>
            <Phone size={14} className={isMissed ? 'text-amber-600' : 'text-green-600'} />
          </div>
          <div className="w-px flex-1 bg-gray-100 mt-1" />
        </div>
        <div className="flex-1 pb-4 min-w-0">
          <NoteCard
            note={activity.note}
            source={activity.note.source}
            moveTargets={moveTargets}
            onMove={onMoveNote}
            onDelete={onDeleteNote}
            formatDate={formatDate}
          />
        </div>
      </div>
    );
  }

  if (activity.type === 'email') {
    const email = activity.email;
    const isIncoming = email.direction === 'INBOUND';
    return (
      <div className={`flex gap-3 ${email.isHidden ? 'opacity-50' : ''}`}>
        <div className="flex flex-col items-center">
          <EmailDirectionIcon direction={email.direction} />
          <div className="w-px flex-1 bg-gray-100 mt-1" />
        </div>
        <div className="flex-1 pb-4 min-w-0 group">
          <button
            onClick={() => loadEmailBody(email.graphMessageId)}
            className={`w-full text-left rounded-lg px-4 py-3 transition hover:bg-gray-50 ${emailOpen ? 'bg-tc-blue/5 border border-tc-blue/20' : 'bg-gray-50'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className={`text-sm truncate ${!email.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {email.subject || '(Kein Betreff)'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 min-w-0">
                  <EmailDirectionLabel direction={email.direction} />
                  <span className="truncate">{isIncoming ? `Von ${email.from}` : `An ${email.to}`}</span>
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
                {email.isHidden ? (
                  onUnhideEmail && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onUnhideEmail(email.id); }}
                      className="text-gray-400 hover:text-tc-blue transition ml-1"
                      title="E-Mail wieder einblenden"
                    >
                      <Eye size={12} />
                    </button>
                  )
                ) : (
                  onHideEmail && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onHideEmail(email.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition ml-1"
                      title="E-Mail ausblenden"
                    >
                      <EyeOff size={12} />
                    </button>
                  )
                )}
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
                <p className="text-sm text-amber-700">{emailBodyError ?? 'E-Mail konnte nicht geladen werden'}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
