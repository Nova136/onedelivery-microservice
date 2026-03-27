/**
 * WebSocket $disconnect handler
 *
 * Removes the connection record from ws.connections (PostgreSQL).
 */

'use strict';

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
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
