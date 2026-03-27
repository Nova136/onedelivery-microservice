/**
 * WebSocket Lambda Authorizer
 *
 * Validates JWT, enforces RBAC, and applies per-user rate limiting
 * using a PostgreSQL tumbling-window counter (ws.rate_limit table).
 *
 * Query string: ?token=<JWT>
 * JWT algorithm: HS256 (Node.js crypto — no external deps for verification)
 */

'use strict';

const crypto = require('crypto');
const { Client } = require('pg');

const JWT_SECRET    = process.env.JWT_SECRET;
const ALLOWED_ROLES = (process.env.ALLOWED_ROLES || 'User,Admin').split(',');
const RATE_LIMIT    = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '20', 10);
const DATABASE_URL  = process.env.DATABASE_URL;

// ── JWT helpers (HS256, built-in crypto – no external deps) ───────────────────

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

// ── Rate limiting (PostgreSQL atomic increment, tumbling 1-minute window) ─────

async function checkRateLimit(userId) {
  const window = String(Math.floor(Date.now() / 60000));
  const expires = new Date(Date.now() + 120_000); // clean up after 2 minutes

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO ws.rate_limit (user_id, window_key, count, expires_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, window_key)
       DO UPDATE SET count = ws.rate_limit.count + 1
       RETURNING count`,
      [userId, window, expires],
    );
    return rows[0].count <= RATE_LIMIT;
  } finally {
    await client.end();
  }
}

// ── IAM policy builder ─────────────────────────────────────────────────────────

function policy(principalId, effect, resource, context = {}) {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
    },
    context,
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const token = event.queryStringParameters?.token;
  if (!token) return policy('anonymous', 'Deny', event.methodArn);

  let payload;
  try {
    payload = verifyJwt(token);
  } catch (err) {
    console.warn('JWT validation failed:', err.message);
    return policy('anonymous', 'Deny', event.methodArn);
  }

  const userId = payload.sub ?? payload.userId ?? payload.id;
  const role   = payload.role;

  if (!userId) return policy('anonymous', 'Deny', event.methodArn);

  if (!ALLOWED_ROLES.includes(role)) {
    console.warn(`RBAC deny: userId=${userId} role=${role}`);
    return policy(userId, 'Deny', event.methodArn);
  }

  try {
    const withinLimit = await checkRateLimit(userId);
    if (!withinLimit) {
      console.warn(`Rate limit exceeded: userId=${userId}`);
      return policy(userId, 'Deny', event.methodArn);
    }
  } catch (err) {
    console.error('Rate limit check failed:', err.message);
    return policy(userId, 'Deny', event.methodArn);
  }

  return policy(userId, 'Allow', event.methodArn, { userId, role });
};
