/**
 * WebSocket Lambda Authorizer
 *
 * Triggered on $connect. Validates JWT, enforces RBAC, and applies per-user
 * rate limiting using a DynamoDB tumbling-window counter.
 *
 * Query string: ?token=<JWT>
 * JWT algorithm: HS256 (verified with JWT_SECRET env var, no external deps)
 */

'use strict';

const crypto = require('crypto');
const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE;
const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '20', 10);
const JWT_SECRET = process.env.JWT_SECRET;
const ALLOWED_ROLES = (process.env.ALLOWED_ROLES || 'customer,admin').split(',');

// ── JWT helpers (HS256 only, uses built-in crypto – no external deps) ──────────

function b64urlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64 + '='.repeat((4 - (base64.length % 4)) % 4), 'base64');
}

function verifyJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  if (header.alg !== 'HS256') throw new Error(`Unsupported alg: ${header.alg}`);

  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (expected !== sigB64) throw new Error('Invalid signature');

  const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');

  return payload;
}

// ── Rate limiting (tumbling 1-minute window per userId) ────────────────────────

async function checkRateLimit(userId) {
  const now = Math.floor(Date.now() / 1000);
  const window = String(Math.floor(now / 60));
  const ttl = now + 120; // clean up after 2 minutes

  const result = await dynamo.send(new UpdateItemCommand({
    TableName: RATE_LIMIT_TABLE,
    Key: {
      userId: { S: userId },
      window: { S: window },
    },
    UpdateExpression: 'ADD #c :inc SET #ttl = if_not_exists(#ttl, :ttl)',
    ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':inc': { N: '1' },
      ':ttl': { N: String(ttl) },
    },
    ReturnValues: 'ALL_NEW',
  }));

  return parseInt(result.Attributes?.count?.N ?? '1', 10) <= RATE_LIMIT_PER_MINUTE;
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

  // Support both sub (standard) and userId / id claim shapes
  const userId = payload.sub ?? payload.userId ?? payload.id;
  const role = payload.role;

  if (!userId) return policy('anonymous', 'Deny', event.methodArn);

  // RBAC: only allow configured roles to use the chat WebSocket
  if (!ALLOWED_ROLES.includes(role)) {
    console.warn(`RBAC deny: userId=${userId} role=${role}`);
    return policy(userId, 'Deny', event.methodArn);
  }

  // Rate limit: per user, per minute
  const withinLimit = await checkRateLimit(userId);
  if (!withinLimit) {
    console.warn(`Rate limit exceeded: userId=${userId}`);
    return policy(userId, 'Deny', event.methodArn);
  }

  return policy(userId, 'Allow', event.methodArn, { userId, role });
};
