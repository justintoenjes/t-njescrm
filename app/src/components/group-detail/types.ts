export type GroupNoteSource = {
  type: 'lead' | 'opportunity';
  label: string;
  id: string;
};

export type GroupNote = {
  id: string;
  content: string;
  isAiGenerated?: boolean;
  createdAt: string;
  author: { id: string; name: string } | null;
  contextLabel: string | null;
  source: GroupNoteSource;
};

export type GroupEmail = {
  id: string;
  graphMessageId: string;
  subject: string | null;
  from: string | null;
  fromEmail: string;
  to: string;
  date: string;
  preview: string;
  isRead: boolean;
  hasAttachments: boolean;
  direction: 'INBOUND' | 'OUTBOUND';
  contextLabel: string | null;
};

export type GroupActivity =
  | { type: 'note'; id: string; date: Date; note: GroupNote }
  | { type: 'email'; id: string; date: Date; email: GroupEmail }
  | { type: 'call'; id: string; date: Date; note: GroupNote };

export type TimelineFilter = 'all' | 'notes' | 'emails' | 'calls';

export type NoteTarget = {
  type: 'lead' | 'opportunity';
  label: string;
  id: string;
};
