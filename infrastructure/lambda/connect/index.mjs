/**
 * WebSocket $connect handler
 *
 * Stores connectionId → {userId, sessionId} in ws.connections (PostgreSQL).
 * userId comes from the Lambda Authorizer context.
 *
 * DATABASE_URL is injected as an env var by Terraform (sourced from SSM).
 */

import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

// Strip ?sslmode=* from DATABASE_URL — pg v8 now treats sslmode=require as
// verify-full, overriding ssl.rejectUnauthorized=false.
const DB_URL = (process.env.DATABASE_URL || '')
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/[?&]$/, '');

export const handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const userId       = event.requestContext.authorizer?.userId;
  const sessionId    =
    event.queryStringParameters?.sessionId ?? crypto.randomUUID();

  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO ws.connections (connection_id, user_id, session_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
       ON CONFLICT (connection_id) DO UPDATE
         SET user_id = $2, session_id = $3, expires_at = NOW() + INTERVAL '24 hours'`,
      [connectionId, userId, sessionId],
    );
  } finally {
    await client.end();
  }

  console.log(`Connected: connectionId=${connectionId} userId=${userId} sessionId=${sessionId}`);
  return { statusCode: 200 };
};
