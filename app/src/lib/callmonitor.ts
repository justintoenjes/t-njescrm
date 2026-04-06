import { Socket } from 'net';
import { prisma } from './prisma';

const FRITZBOX_HOST = '192.168.178.1';
const FRITZBOX_PORT = 1012;

export type CallEvent = {
  type: 'ring' | 'connect' | 'disconnect';
  timestamp: Date;
  connectionId: string;
  direction: 'incoming' | 'outgoing';
  callerNumber: string;
  calledNumber: string;
  extension: string;
  duration?: number; // seconds, only on disconnect
  leadId?: string;
  leadName?: string;
};

type Listener = (event: CallEvent) => void;
const listeners = new Set<Listener>();

let socket: Socket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
const activeCallsMap = new Map<string, { direction: 'incoming' | 'outgoing'; callerNumber: string; calledNumber: string; extension: string }>();

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\/()+]/g, '').replace(/^0049/, '0').replace(/^49/, '0');
}

async function findLeadByPhone(number: string): Promise<{ id: string; name: string } | null> {
  if (!number || number.length < 4) return null;
  const normalized = normalizePhone(number);

  // Try exact match first, then partial
  const leads = await prisma.lead.findMany({
    where: { phone: { not: null }, archived: false },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  for (const lead of leads) {
    if (!lead.phone) continue;
    const leadNorm = normalizePhone(lead.phone);
    if (leadNorm === normalized || leadNorm.endsWith(normalized) || normalized.endsWith(leadNorm)) {
      return { id: lead.id, name: `${lead.firstName} ${lead.lastName}`.trim() };
    }
  }
  return null;
}

function parseLine(line: string): CallEvent | null {
  // Format: DD.MM.YY HH:MM:SS;TYPE;ConnectionID;Extension;CallerNumber;CalledNumber;SIP
  // RING: 01.04.26 10:15:30;RING;0;11;0441123456;611;SIP0
  // CALL: 01.04.26 10:15:30;CALL;0;11;611;0441123456;SIP0
  // CONNECT: 01.04.26 10:15:35;CONNECT;0;11;0441123456
  // DISCONNECT: 01.04.26 10:15:50;DISCONNECT;0;15
  const parts = line.trim().split(';');
  if (parts.length < 4) return null;

  const [dateStr, type, connId, ...rest] = parts;
  const [day, month, year, hour, min, sec] = dateStr.split(/[.\s:]/);
  const timestamp = new Date(`20${year}-${month}-${day}T${hour}:${min}:${sec}`);

  if (type === 'RING') {
    // Incoming call: extension, callerNumber, calledNumber, SIP
    const [extension, callerNumber, calledNumber] = rest;
    activeCallsMap.set(connId, { direction: 'incoming', callerNumber, calledNumber, extension });
    return { type: 'ring', timestamp, connectionId: connId, direction: 'incoming', callerNumber, calledNumber, extension };
  }

  if (type === 'CALL') {
    // Outgoing call: extension, callerNumber(own), calledNumber(external), SIP
    const [extension, callerNumber, calledNumber] = rest;
    activeCallsMap.set(connId, { direction: 'outgoing', callerNumber, calledNumber, extension });
    return { type: 'ring', timestamp, connectionId: connId, direction: 'outgoing', callerNumber: calledNumber, calledNumber: callerNumber, extension };
  }

  if (type === 'CONNECT') {
    const active = activeCallsMap.get(connId);
    if (!active) return null;
    return { type: 'connect', timestamp, connectionId: connId, ...active };
  }

  if (type === 'DISCONNECT') {
    const [durationStr] = rest;
    const active = activeCallsMap.get(connId);
    activeCallsMap.delete(connId);
    if (!active) return null;
    return { type: 'disconnect', timestamp, connectionId: connId, ...active, duration: parseInt(durationStr) || 0 };
  }

  return null;
}

async function handleEvent(event: CallEvent) {
  // Find matching lead
  const externalNumber = event.direction === 'incoming' ? event.callerNumber : event.calledNumber;
  const lead = await findLeadByPhone(externalNumber);
  if (lead) {
    event.leadId = lead.id;
    event.leadName = lead.name;
  }

  // Auto-log based on event type
  if (event.type === 'disconnect' && event.duration !== undefined) {
    if (lead) {
      const durationMin = Math.floor(event.duration / 60);
      const durationSec = event.duration % 60;
      const durationStr = event.duration > 0 ? `${durationMin}:${String(durationSec).padStart(2, '0')} min` : '';
      const dirLabel = event.direction === 'incoming' ? 'Eingehender' : 'Ausgehender';

      if (event.duration > 0) {
        // Connected call — create note + update lastContactedAt
        await prisma.$transaction([
          prisma.note.create({
            data: {
              content: `${dirLabel} Anruf (${durationStr}) mit ${externalNumber}`,
              isAiGenerated: true,
              leadId: lead.id,
            },
          }),
          prisma.lead.update({
            where: { id: lead.id },
            data: { lastContactedAt: event.timestamp, missedCallsCount: 0 },
          }),
        ]);
      } else {
        // Missed/no answer — increment missedCallsCount
        await prisma.lead.update({
          where: { id: lead.id },
          data: { missedCallsCount: { increment: 1 } },
        });
      }
    }
  }

  // Notify all listeners
  listeners.forEach(listener => {
    try { listener(event); } catch {}
  });
}

function connect() {
  if (socket) return;

  socket = new Socket();
  socket.setEncoding('utf-8');

  let buffer = '';

  socket.on('data', (data: string) => {
    buffer += data;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseLine(line);
      if (event) handleEvent(event);
    }
  });

  socket.on('error', () => {
    socket = null;
    scheduleReconnect();
  });

  socket.on('close', () => {
    socket = null;
    scheduleReconnect();
  });

  socket.connect(FRITZBOX_PORT, FRITZBOX_HOST, () => {
    console.log('[Callmonitor] Connected to Fritz!Box');
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 10_000); // Retry every 10s
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Start connection on first subscriber
  if (listeners.size === 1) connect();
  return () => { listeners.delete(listener); };
}

export function ensureConnected() {
  connect();
}
