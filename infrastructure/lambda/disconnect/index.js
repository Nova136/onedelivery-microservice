/**
 * WebSocket $disconnect handler
 *
 * Removes the connection record from DynamoDB on client disconnect.
 * DynamoDB TTL handles any records that were not cleaned up (e.g. forced disconnect).
 */

'use strict';

const { DynamoDBClient, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  await dynamo.send(new DeleteItemCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId: { S: connectionId } },
  }));

  console.log(`Disconnected: connectionId=${connectionId}`);
  return { statusCode: 200 };
};
