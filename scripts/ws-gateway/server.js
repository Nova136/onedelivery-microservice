/**
 * Local WebSocket gateway — simulates Lambda + API Gateway WebSocket for local dev.
 *
 * Uses PostgreSQL (ws schema) for connection tracking and rate limiting,
 * matching production behaviour exactly.
 *
 * WebSocket:  ws://localhost:3015  (or via Kong: ws://localhost:8000/ws)
 *   Connect:     ?token=<JWT>  [&sessionId=<id>]
 *   Send msg:    { "action": "sendMessage", "sessionId": "...", "message": "..." }
 *   Disconnect:  standard WS close
 *
 * HTTP push-back (for orchestrator-agent):
 *   POST http://ws-gateway:3015/connections/:connectionId
 *   Body: { "reply": "...", "sessionId": "..." }
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Pool } = require('pg');
const amqp = require('amqplib');

const WS_PORT       = parseInt(process.env.WS_PORT        || '3015', 10);
const JWT_SECRET    = process.env.JWT_SECRET              || 'REDACTED_JWT_SECRET';
const RABBITMQ_URL  = process.env.RABBITMQ_URL            || 'amqp://rabbit:rabbit@localhost:5672';
const ORCH_QUEUE    = process.env.ORCHESTRATOR_QUEUE      || 'orchestrator_agent_queue';
const ALLOWED_ROLES = (process.env.ALLOWED_ROLES          || 'User,Admin').split(',');
const RATE_LIMIT    = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '20', 10);
const DATABASE_URL  = process.env.DATABASE_URL;

// ── PostgreSQL pool ───────────────────────────────────────────────────────────

const db = new Pool({ connectionString: DATABASE_URL });

// ── In-memory map: connectionId → WebSocket instance (for push-back) ─────────
// Only the live WS socket needs to be kept in memory; all other state is in PG.

const liveSockets = new Map();

// ── JWT helpers ───────────────────────────────────────────────────────────────

function b64urlDecode(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b + '='.repeat((4 - (b.length % 4)) % 4), 'base64');
}

function verifyJwt(token) {
  const [hB64, pB64, sigB64] = token.split('.');
  if (!hB64 || !pB64 || !sigB64) throw new Error('Malformed JWT');
  const header = JSON.parse(b64urlDecode(hB64).toString('utf8'));
  if (header.alg !== 'HS256') throw new Error(`Unsupported alg: ${header.alg}`);
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${hB64}.${pB64}`).digest('base64url');
  if (expected !== sigB64) throw new Error('Invalid signature');
  const payload = JSON.parse(b64urlDecode(pB64).toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

// ── Rate limiting (PostgreSQL atomic increment, matches Lambda authorizer) ────

async function checkRateLimit(userId) {
  const window  = String(Math.floor(Date.now() / 60000));
  const expires = new Date(Date.now() + 120_000);
  const { rows } = await db.query(
    `INSERT INTO ws.rate_limit (user_id, window_key, count, expires_at)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (user_id, window_key)
     DO UPDATE SET count = ws.rate_limit.count + 1
     RETURNING count`,
    [userId, window, expires],
  );
  return rows[0].count <= RATE_LIMIT;
}

// ── RabbitMQ publish ──────────────────────────────────────────────────────────

let rmqConn    = null;
let rmqChannel = null;

async function ensureRmq() {
  if (rmqChannel) return rmqChannel;
  rmqConn    = await amqp.connect(RABBITMQ_URL);
  rmqChannel = await rmqConn.createChannel();
  await rmqChannel.assertQueue(ORCH_QUEUE, { durable: false });
  rmqConn.on('close', () => { rmqConn = null; rmqChannel = null; });
  rmqConn.on('error', () => { rmqConn = null; rmqChannel = null; });
  console.log(`[RMQ] Connected → queue: ${ORCH_QUEUE}`);
  return rmqChannel;
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const server = http.createServer();
const wss    = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
  const url         = new URL(req.url, `http://localhost:${WS_PORT}`);
  const token       = url.searchParams.get('token');
  const querySession = url.searchParams.get('sessionId');

  let userId, role;
  try {
    if (!token) throw new Error('Missing token');
    const payload = verifyJwt(token);
    userId = payload.sub ?? payload.userId ?? payload.id;
    role   = payload.role;
    if (!userId)                     throw new Error('No userId in token');
    if (!ALLOWED_ROLES.includes(role)) throw new Error(`Role ${role} not allowed`);
    const allowed = await checkRateLimit(userId);
    if (!allowed)                    throw new Error('Rate limit exceeded');
  } catch (err) {
    console.warn(`[WS] Auth denied: ${err.message}`);
    ws.close(4001, err.message);
    return;
  }

  const connectionId = crypto.randomBytes(10).toString('base64url');
  const sessionId    = querySession ?? crypto.randomUUID();

  // Persist connection to PostgreSQL
  await db.query(
    `INSERT INTO ws.connections (connection_id, user_id, session_id, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
     ON CONFLICT (connection_id) DO UPDATE
       SET user_id = $2, session_id = $3, expires_at = NOW() + INTERVAL '24 hours'`,
    [connectionId, userId, sessionId],
  );
  liveSockets.set(connectionId, ws);
  console.log(`[WS] Connected  connId=${connectionId} userId=${userId} session=${sessionId}`);

  ws.on('message', async (raw) => {
    let body;
    try { body = JSON.parse(raw.toString()); }
    catch { ws.send(JSON.stringify({ error: 'Invalid JSON' })); return; }

    if (body.action !== 'sendMessage') return;

    const message = (body.message ?? '').trim();
    if (!message) { ws.send(JSON.stringify({ error: 'message is required' })); return; }

    const withinLimit = await checkRateLimit(userId).catch(() => false);
    if (!withinLimit) { ws.send(JSON.stringify({ error: 'Rate limit exceeded' })); return; }

    const resolvedSession = body.sessionId ?? sessionId;
    try {
      const ch = await ensureRmq();
      ch.sendToQueue(
        ORCH_QUEUE,
        Buffer.from(JSON.stringify({ pattern: 'ws.chat', data: { connectionId, userId, sessionId: resolvedSession, message } })),
        { persistent: false },
      );
      ws.send(JSON.stringify({ ack: true }));
      console.log(`[WS] Queued: connId=${connectionId} userId=${userId}`);
    } catch (err) {
      console.error('[WS] RMQ publish failed:', err.message);
      ws.send(JSON.stringify({ error: 'Failed to queue message' }));
    }
  });

  ws.on('close', async () => {
    liveSockets.delete(connectionId);
    await db.query('DELETE FROM ws.connections WHERE connection_id = $1', [connectionId]).catch(() => {});
    console.log(`[WS] Disconnected connId=${connectionId}`);
  });

  ws.on('error', (err) => console.error(`[WS] Error connId=${connectionId}:`, err.message));
});

// ── HTTP Management API (POST /connections/:connectionId) ─────────────────────

server.on('request', (req, res) => {
  const match = req.url.match(/^\/connections\/([^/]+)$/);
  if (!match || req.method !== 'POST') {
    res.writeHead(404); res.end(); return;
  }

  const connectionId = match[1];
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const ws = liveSockets.get(connectionId);
    if (!ws) {
      res.writeHead(410); res.end(JSON.stringify({ message: 'Connection not found' })); return;
    }
    try {
      ws.send(body); // forward raw JSON to client
      res.writeHead(200); res.end();
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ message: err.message }));
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(WS_PORT, () => {
  console.log(`[ws-gateway] Listening on :${WS_PORT}`);
  console.log(`  WebSocket : ws://localhost:${WS_PORT}?token=<JWT>`);
  console.log(`  Push-back : POST http://localhost:${WS_PORT}/connections/:connectionId`);
});

ensureRmq().catch((err) => console.warn('[RMQ] Initial connect failed, will retry:', err.message));
