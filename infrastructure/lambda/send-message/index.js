/**
 * WebSocket sendMessage handler
 *
 * Resolves userId from ws.connections (PostgreSQL), then publishes a
 * NestJS-compatible RabbitMQ message to the orchestrator queue.
 * Returns immediately — reply arrives asynchronously via WebSocket push.
 *
 * Expected client payload: { "action": "sendMessage", "sessionId": "...", "message": "..." }
 */

'use strict';

const { Client } = require('pg');
const amqp = require('amqplib');

const DATABASE_URL      = process.env.DATABASE_URL;
const RABBITMQ_URL      = process.env.RABBITMQ_URL;
const ORCHESTRATOR_QUEUE = process.env.ORCHESTRATOR_QUEUE || 'orchestrator_agent_queue';

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { sessionId, message } = body;
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }

  // Resolve userId + sessionId from the connection record
  const dbClient = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await dbClient.connect();
  let userId, resolvedSessionId;
  try {
    const { rows } = await dbClient.query(
      'SELECT user_id, session_id FROM ws.connections WHERE connection_id = $1',
      [connectionId],
    );
    if (!rows.length) {
      return { statusCode: 410, body: JSON.stringify({ error: 'Connection not found' }) };
    }
    userId             = rows[0].user_id;
    resolvedSessionId  = sessionId ?? rows[0].session_id;
  } finally {
    await dbClient.end();
  }

  // Publish to RabbitMQ in NestJS microservice message format
  const conn = await amqp.connect(RABBITMQ_URL);
  try {
    const channel = await conn.createChannel();
    await channel.assertQueue(ORCHESTRATOR_QUEUE, { durable: false });
    channel.sendToQueue(
      ORCHESTRATOR_QUEUE,
      Buffer.from(JSON.stringify({
        pattern: 'ws.chat',
        data: { connectionId, userId, sessionId: resolvedSessionId, message: message.trim() },
      })),
      { persistent: false },
    );
    await channel.close();
  } finally {
    await conn.close();
  }

  console.log(`Queued: connectionId=${connectionId} userId=${userId} session=${resolvedSessionId}`);
  return { statusCode: 200 };
};
