const net = require('net');
const { Client } = require('pg');
const http = require('http');
const crypto = require('crypto');

// Config from env
const FRITZ_HOST = process.env.FRITZBOX_HOST || '192.168.178.1';
const FRITZ_PORT = 1012;
const FRITZ_USER = process.env.FRITZBOX_USER || '';
const FRITZ_PASS = process.env.FRITZBOX_PASSWORD || '';
const FRITZ_DIAL_PORT = process.env.FRITZBOX_DIAL_PORT || '611';
const DB_URL = process.env.DATABASE_URL;
const SSE_PORT = 3001;

if (!DB_URL) { console.error('[Callmonitor] DATABASE_URL not set'); process.exit(1); }

const db = new Client({ connectionString: DB_URL });
const activeCalls = new Map();
const sseClients = new Set();

// --- Phone normalization (mirrors app/src/lib/phone.ts) ---
function normalizePhone(phone) {
  if (!phone) return null;
  let n = phone.replace(/[\s\-\/()+.]/g, '');
  if (n.startsWith('0049')) n = n.slice(4);
  else if (n.startsWith('49') && n.length > 6) n = n.slice(2);
  else if (n.startsWith('0')) n = n.slice(1);
  if (!n || n.length < 3) return null;
  return '+49' + n;
}

// --- Database ---
async function findLeadByPhone(number) {
  if (!number || number.length < 4) return null;
  const normalized = normalizePhone(number);
  if (!normalized) return null;

  // Direct match — phones are stored normalized as +49...
  const res = await db.query(
    `SELECT id, name FROM "Lead" WHERE phone = $1 AND archived = false LIMIT 1`,
    [normalized]
  );
  if (res.rows.length > 0) return { id: res.rows[0].id, name: res.rows[0].name };

  // Fallback: suffix match for legacy data not yet normalized
  const allRes = await db.query(
    `SELECT id, name, phone FROM "Lead" WHERE phone IS NOT NULL AND archived = false`
  );
  const normDigits = normalized.replace(/\D/g, '');
  for (const lead of allRes.rows) {
    const leadDigits = lead.phone.replace(/\D/g, '');
    if (leadDigits.endsWith(normDigits) || normDigits.endsWith(leadDigits)) {
      return { id: lead.id, name: lead.name };
    }
  }
  return null;
}

function cuid() {
  return 'c' + crypto.randomBytes(12).toString('hex');
}

async function createNote(leadId, content) {
  await db.query(
    `INSERT INTO "Note" (id, content, "isAiGenerated", "createdAt", "leadId") VALUES ($1, $2, false, NOW(), $3)`,
    [cuid(), content, leadId]
  );
}

async function updateLeadContact(leadId) {
  await db.query(
    `UPDATE "Lead" SET "lastContactedAt" = NOW(), "missedCallsCount" = 0 WHERE id = $1`,
    [leadId]
  );
}

async function incrementMissed(leadId) {
  await db.query(
    `UPDATE "Lead" SET "missedCallsCount" = "missedCallsCount" + 1 WHERE id = $1`,
    [leadId]
  );
}

// --- SSE ---
function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(res => {
    try { res.write(data); } catch { sseClients.delete(res); }
  });
}

const sseServer = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    const iv = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { clearInterval(iv); sseClients.delete(res); }
    }, 30000);
    return;
  }
  res.writeHead(404);
  res.end();
});

// --- Fritz!Box Callmonitor ---
// CALL format: date;CALL;connId;extension;ownNumber;externalNumber;SIP
// RING format: date;RING;connId;extension;callerNumber;calledNumber;SIP
function parseLine(line) {
  const parts = line.trim().split(';');
  if (parts.length < 4) return null;

  const [dateStr, type, connId, ...rest] = parts;
  const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const timestamp = new Date(`20${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}`);

  if (type === 'RING') {
    // Incoming: ext, externalCaller, ownNumber
    const [ext, externalCaller, ownNumber] = rest;
    activeCalls.set(connId, { direction: 'incoming', externalNumber: externalCaller, ownNumber, extension: ext });
    return { type: 'ring', timestamp, connectionId: connId, direction: 'incoming', externalNumber: externalCaller, ownNumber, extension: ext };
  }
  if (type === 'CALL') {
    // Outgoing: ext, ownNumber, externalCalled, SIP
    const [ext, ownNumber, externalCalled] = rest;
    activeCalls.set(connId, { direction: 'outgoing', externalNumber: externalCalled, ownNumber, extension: ext });
    return { type: 'ring', timestamp, connectionId: connId, direction: 'outgoing', externalNumber: externalCalled, ownNumber, extension: ext };
  }
  if (type === 'CONNECT') {
    const active = activeCalls.get(connId);
    if (!active) return null;
    return { type: 'connect', timestamp, connectionId: connId, ...active };
  }
  if (type === 'DISCONNECT') {
    const [durationStr] = rest;
    const active = activeCalls.get(connId);
    activeCalls.delete(connId);
    if (!active) return null;
    return { type: 'disconnect', timestamp, connectionId: connId, ...active, duration: parseInt(durationStr) || 0 };
  }
  return null;
}

async function handleEvent(event) {
  // Match external number to lead
  const lead = await findLeadByPhone(event.externalNumber);
  if (lead) {
    event.leadId = lead.id;
    event.leadName = lead.name;
  }

  console.log(`[Call] ${event.type} ${event.direction} ${event.externalNumber} ${lead ? `-> ${lead.name}` : '(unbekannt)'}`);
  broadcast(event);

  if (event.type === 'disconnect' && lead) {
    const dirLabel = event.direction === 'incoming' ? 'Eingehender' : 'Ausgehender';
    if (event.duration > 0) {
      const min = Math.floor(event.duration / 60);
      const sec = String(event.duration % 60).padStart(2, '0');
      await createNote(lead.id, `${dirLabel} Anruf (${min}:${sec} min) mit ${event.externalNumber}`);
      await updateLeadContact(lead.id);
      console.log(`[Call] Logged: ${lead.name}, ${min}:${sec} min`);
    } else {
      await incrementMissed(lead.id);
      console.log(`[Call] Missed: ${lead.name}`);
    }
  }
}

function connectCallmonitor() {
  const socket = new net.Socket();
  let buffer = '';

  socket.setEncoding('utf-8');
  socket.on('data', (data) => {
    buffer += data;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseLine(line);
      if (event) handleEvent(event).catch(err => console.error('[Call] Error:', err.message));
    }
  });

  socket.on('error', (err) => {
    console.error(`[Callmonitor] Error: ${err.message}`);
    setTimeout(connectCallmonitor, 10000);
  });

  socket.on('close', () => {
    console.log('[Callmonitor] Disconnected, reconnecting in 10s...');
    setTimeout(connectCallmonitor, 10000);
  });

  socket.connect(FRITZ_PORT, FRITZ_HOST, () => {
    console.log(`[Callmonitor] Connected to Fritz!Box ${FRITZ_HOST}:${FRITZ_PORT}`);
  });
}

// --- Fritz!Box TR-064 Click-to-Dial with Digest Auth ---
async function tr064Request(controlUrl, serviceType, action, args) {
  if (!FRITZ_USER || !FRITZ_PASS) throw new Error('Fritz!Box Credentials nicht konfiguriert');

  const url = `http://${FRITZ_HOST}:49000${controlUrl}`;
  const argsXml = Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join('');
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${serviceType}">${argsXml}</u:${action}></s:Body></s:Envelope>`;
  const soapAction = `${serviceType}#${action}`;

  // First request to get Digest challenge
  const r1 = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': soapAction },
    body,
  });

  if (r1.status !== 401) return r1;

  const wwwAuth = r1.headers.get('www-authenticate');
  if (!wwwAuth || !wwwAuth.includes('Digest')) throw new Error('Unerwartete Auth-Methode');

  const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || '';
  const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || '';
  const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || 'auth';

  const ha1 = crypto.createHash('md5').update(`${FRITZ_USER}:${realm}:${FRITZ_PASS}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`POST:${controlUrl}`).digest('hex');
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');

  const authHeader = `Digest username="${FRITZ_USER}", realm="${realm}", nonce="${nonce}", uri="${controlUrl}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': soapAction, 'Authorization': authHeader },
    body,
  });
}

async function dial(number) {
  const svc = 'urn:dslforum-org:service:X_VoIP:1';

  const res = await tr064Request('/upnp/control/x_voip', svc, 'X_AVM-DE_DialNumber', {
    'NewX_AVM-DE_PhoneNumber': number,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dial fehlgeschlagen (${res.status}): ${text.substring(0, 100)}`);
  }

  console.log(`[Dial] Wähle ${number}`);
  return { ok: true };
}

// --- Dial HTTP API ---
const dialServer = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/dial') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { number } = JSON.parse(body);
        if (!number) { res.writeHead(400); res.end(JSON.stringify({ error: 'Nummer fehlt' })); return; }
        await dial(number);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: `Wähle ${number}...` }));
      } catch (err) {
        console.error('[Dial] Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

// --- Daily push reminder check ---
const PUSH_CRON_SECRET = process.env.PUSH_CRON_SECRET || '';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function scheduleDailyPushCheck() {
  if (!PUSH_CRON_SECRET) {
    console.log('[PushCheck] PUSH_CRON_SECRET not set, skipping daily reminders');
    return;
  }

  function msUntilNext(hour, minute) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target - now;
  }

  function runCheck() {
    console.log('[PushCheck] Running daily reminder check...');
    fetch(`${APP_URL}/api/push/check-reminders`, {
      method: 'POST',
      headers: { 'x-cron-secret': PUSH_CRON_SECRET },
    })
      .then(r => r.json())
      .then(data => console.log('[PushCheck] Result:', JSON.stringify(data)))
      .catch(err => console.error('[PushCheck] Error:', err.message));

    // Schedule next run
    setTimeout(runCheck, msUntilNext(8, 0));
  }

  // Schedule first run at 08:00
  const ms = msUntilNext(8, 0);
  console.log(`[PushCheck] Next check in ${Math.round(ms / 60000)}min`);
  setTimeout(runCheck, ms);
}

// --- Start ---
async function main() {
  console.log('[Callmonitor] Starting...');
  await db.connect();
  console.log('[Callmonitor] Database connected');

  sseServer.listen(SSE_PORT, '0.0.0.0', () => console.log(`[Callmonitor] SSE on :${SSE_PORT}`));
  dialServer.listen(3002, '0.0.0.0', () => console.log('[Callmonitor] Dial on :3002'));

  connectCallmonitor();
  scheduleDailyPushCheck();
}

main().catch(err => { console.error(err); process.exit(1); });
