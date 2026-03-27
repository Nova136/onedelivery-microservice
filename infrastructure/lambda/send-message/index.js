/**
 * WebSocket sendMessage handler
 *
 * Receives a chat message from the client, resolves the userId from DynamoDB,
 * and publishes a NestJS-compatible RabbitMQ message to the orchestrator queue.
 * The Lambda returns immediately (HTTP 200) — the reply arrives asynchronously
 * via WebSocket push from the orchestrator-agent.
 *
 * Expected client payload: { "action": "sendMessage", "sessionId": "...", "message": "..." }
 */

'use strict';

const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const amqp = require('amqplib');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const ORCHESTRATOR_QUEUE = process.env.ORCHESTRATOR_QUEUE || 'orchestrator_agent_queue';

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  // Parse and validate body
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

  // Resolve userId from the connection record
  const record = await dynamo.send(new GetItemCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId: { S: connectionId } },
  }));

  if (!record.Item) {
    // Connection was not registered (should not happen in normal flow)
    return { statusCode: 410, body: JSON.stringify({ error: 'Connection not found' }) };
  }

  const userId = record.Item.userId.S;
  const resolvedSessionId = sessionId ?? record.Item.sessionId.S;

  // Publish to RabbitMQ in NestJS microservice message format:
  // { pattern: 'ws.chat', data: { ... } }
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
