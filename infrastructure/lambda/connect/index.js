/**
 * WebSocket $connect handler
 *
 * Stores the connection ID → {userId, sessionId} mapping in DynamoDB
 * so the orchestrator-agent can push replies back to the right client.
 *
 * userId comes from the Lambda Authorizer context (set on $connect).
 * sessionId may be provided as a query param; a new one is generated if absent.
 */

'use strict';

const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const TTL_SECONDS = 86400; // 24 hours

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const userId = event.requestContext.authorizer?.userId;
  const sessionId =
    event.queryStringParameters?.sessionId ?? `ws-${Date.now()}-${connectionId.slice(-6)}`;
  const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;

  await dynamo.send(new PutItemCommand({
    TableName: CONNECTIONS_TABLE,
    Item: {
      connectionId: { S: connectionId },
      userId:       { S: userId },
      sessionId:    { S: sessionId },
      connectedAt:  { N: String(Math.floor(Date.now() / 1000)) },
      ttl:          { N: String(ttl) },
    },
  }));

  console.log(`Connected: connectionId=${connectionId} userId=${userId} sessionId=${sessionId}`);
  return { statusCode: 200 };
};
