/**
 * WebSocket $connect handler
 *
 * Stores connectionId → {userId, sessionId} in ws.connections (PostgreSQL).
 * userId comes from the Lambda Authorizer context.
 */

'use strict';

const crypto = require('crypto');
const { Client } = require('pg');

const DATABASE_URL  = process.env.DATABASE_URL;

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const userId       = event.requestContext.authorizer?.userId;
  const sessionId    =
    event.queryStringParameters?.sessionId ?? crypto.randomUUID();

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
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
