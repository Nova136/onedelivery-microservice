/**
 * WebSocket $disconnect handler
 *
 * Removes the connection record from ws.connections (PostgreSQL).
 *
 * DATABASE_URL is injected as an env var by Terraform (sourced from SSM).
 */

import pg from 'pg';

const { Client } = pg;

// Strip ?sslmode=* from DATABASE_URL — pg v8 now treats sslmode=require as
// verify-full, overriding ssl.rejectUnauthorized=false.
const DB_URL = (process.env.DATABASE_URL || '')
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/[?&]$/, '');

export const handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(
      'DELETE FROM ws.connections WHERE connection_id = $1',
      [connectionId],
    );
  } finally {
    await client.end();
  }

  console.log(`Disconnected: connectionId=${connectionId}`);
  return { statusCode: 200 };
};
