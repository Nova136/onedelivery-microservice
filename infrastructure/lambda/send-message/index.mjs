/**
 * WebSocket sendMessage handler
 *
 * Verifies the JWT included in the message payload, then publishes a
 * NestJS-compatible RabbitMQ message to the orchestrator queue.
 * Returns immediately — reply arrives asynchronously via WebSocket push.
 *
 * Expected client payload:
 *   { "action": "sendMessage", "token": "<jwt>", "sessionId": "...", "message": "..." }
 *
 * NOTE: This Lambda runs OUTSIDE the VPC so it can reach CloudAMQP over the
 * internet. JWT is verified locally (HS256); no DB query needed.
 *
 * JWT_SECRET and RABBITMQ_URL are fetched from SSM Parameter Store at cold start.
 */

import crypto from 'node:crypto';
import amqp from 'amqplib';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';

// ── SSM cold-start fetch ───────────────────────────────────────────────────────

const _ssm = new SSMClient({});
const { Parameters: _params } = await _ssm.send(new GetParametersCommand({
  Names: [process.env.SSM_JWT_SECRET, process.env.SSM_RABBITMQ_URL],
  WithDecryption: true,
}));
const _map = Object.fromEntries(_params.map(p => [p.Name, p.Value]));

const JWT_SECRET   = _map[process.env.SSM_JWT_SECRET];
const RABBITMQ_URL = _map[process.env.SSM_RABBITMQ_URL];

// ── Non-secret config ─────────────────────────────────────────────────────────

const ORCHESTRATOR_QUEUE = process.env.ORCHESTRATOR_QUEUE || 'orchestrator_agent_queue';

// ── Cached AMQP connection (reused across warm invocations) ───────────────────

let _conn   = null;
let _channel = null;

async function getChannel() {
  if (_channel && !_channel.isClosed()) return _channel;
  // Connection may be stale — reconnect
  try { await _conn?.close(); } catch { /* ignore */ }
  _conn    = await amqp.connect(RABBITMQ_URL);
  _conn.on('error', () => { _conn = null; _channel = null; });
  _conn.on('close', () => { _conn = null; _channel = null; });
  _channel = await _conn.createChannel();
  _channel.on('error', () => { _channel = null; });
  _channel.on('close', () => { _channel = null; });
  return _channel;
}

// ── JWT helpers (HS256, built-in crypto — no external deps) ───────────────────

function b64urlDecode(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b + '='.repeat((4 - (b.length % 4)) % 4), 'base64');
}

function verifyJwt(token) {
  const [hB64, pB64, sigB64] = token.split('.');
  if (!hB64 || !pB64 || !sigB64) throw new Error('Malformed JWT');

  const header = JSON.parse(b64urlDecode(hB64).toString('utf8'));
  if (header.alg !== 'HS256') throw new Error(`Unsupported alg: ${header.alg}`);

  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${hB64}.${pB64}`)
    .digest('base64url');
  if (expected !== sigB64) throw new Error('Invalid signature');

  const payload = JSON.parse(b64urlDecode(pB64).toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { token, sessionId, message } = body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'token is required' }) };
  }

  let jwtPayload;
  try {
    jwtPayload = verifyJwt(token);
  } catch (err) {
    return { statusCode: 401, body: JSON.stringify({ error: `Unauthorized: ${err.message}` }) };
  }

  const userId          = jwtPayload.sub ?? jwtPayload.userId ?? jwtPayload.id;
  const resolvedSession = sessionId ?? crypto.randomUUID();

  if (!userId) {
    return { statusCode: 401, body: JSON.stringify({ error: 'No userId in token' }) };
  }

  const channel = await getChannel();
  await channel.assertQueue(ORCHESTRATOR_QUEUE, { durable: false });
  channel.sendToQueue(
    ORCHESTRATOR_QUEUE,
    Buffer.from(JSON.stringify({
      pattern: { cmd: 'agent.chat' },
      data: { connectionId, userId, sessionId: resolvedSession, message: message.trim() },
    })),
    { persistent: false },
  );

  console.log(`Queued: connectionId=${connectionId} userId=${userId} session=${resolvedSession}`);
  return { statusCode: 200 };
};
