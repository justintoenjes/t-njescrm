import type { Temperature } from '@/lib/temperature';
import type { LeadPhase } from '@/lib/phase';
import type { OpportunityStage } from '@/lib/opportunity';
import type { ScoreBreakdown } from '@/lib/lead-score';
import type { OppScoreBreakdown } from '@/lib/opp-score';

export type NoteData = {
  id: string;
  content: string;
  isAiGenerated?: boolean;
  createdAt: string;
  author: { id: string; name: string } | null;
};

export type OpportunityPreview = {
  id: string;
  title: string;
  stage: OpportunityStage;
  value: number | null;
  score?: number;
  scoreBreakdown?: OppScoreBreakdown;
  temperature: Temperature;
  expectedCloseDate: string | null;
  notes?: NoteData[];
};

export type AttachmentData = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
};

export type FollowUp = { subject: string; body: string };

export type LeadFull = {
  id: string;
  firstName: string;
  lastName: string;
  category: 'VERTRIEB' | 'RECRUITING';
  companyId: string | null;
  companyRef: { id: string; name: string } | null;
  email: string | null;
  phone: string | null;
  formalAddress: boolean;
  archived: boolean;
  phase: LeadPhase;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
  lastContactedAt: string | null;
  createdAt: string;
  temperature: Temperature;
  aiSentimentScore: number | null;
  aiSentimentAt: string | null;
  hasOverdueTasks?: boolean;
  assignedToId: string | null;
  assignedTo: { id: string; name: string } | null;
  missedCallsCount: number;
  noShowCount: number;
  opportunities: OpportunityPreview[];
  notes: NoteData[];
  attachments?: AttachmentData[];
};

export type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  assignedTo?: { id: string; name: string } | null;
};

export type UserOption = { id: string; name: string; email: string };

export type AISummary = {
  summary: string;
  sentiment: string;
  sentimentEmoji: string;
  sentimentExplanation: string;
  sentimentScore: number;
  nextAction: string;
  temperatureSuggestion?: 'warm' | 'hot' | null;
  temperatureSuggestionReason?: string | null;
};

export type PersistedEmail = {
  id: string;
  graphMessageId: string;
  subject: string | null;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  preview: string;
  isRead: boolean;
  hasAttachments: boolean;
  direction: 'INBOUND' | 'OUTBOUND';
};

export type EnrichedNote = NoteData & {
  source: { type: 'lead' | 'opportunity'; label: string; id: string };
};

export type Activity =
  | { type: 'note'; id: string; date: Date; note: EnrichedNote }
  | { type: 'email'; id: string; date: Date; email: PersistedEmail }
  | { type: 'call'; id: string; date: Date; note: EnrichedNote };

export type TimelineFilter = 'all' | 'notes' | 'emails' | 'calls';
