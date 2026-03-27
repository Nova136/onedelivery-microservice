import { Injectable, Logger } from "@nestjs/common";
import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
    GoneException,
} from "@aws-sdk/client-apigatewaymanagementapi";

/**
 * Pushes replies back to WebSocket clients via the API Gateway Management API.
 *
 * Only active when WEBSOCKET_API_ENDPOINT is set (i.e. when enable_websocket = true
 * in Terraform). When the env var is absent the service is a no-op so the
 * orchestrator-agent can still be used over HTTP without any changes.
 */
@Injectable()
export class WebsocketCallbackService {
    private readonly logger = new Logger(WebsocketCallbackService.name);
    private readonly client: ApiGatewayManagementApiClient | null;

    constructor() {
        const endpoint = process.env.WEBSOCKET_API_ENDPOINT;
        this.client = endpoint
            ? new ApiGatewayManagementApiClient({
                  endpoint,
                  region: process.env.AWS_REGION ?? "ap-southeast-1",
              })
            : null;

        if (!endpoint) {
            this.logger.warn(
                "WEBSOCKET_API_ENDPOINT not set — WebSocket push is disabled",
            );
        }
    }

    async pushToConnection(connectionId: string, data: object): Promise<void> {
        if (!this.client) return;

        try {
            await this.client.send(
                new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: Buffer.from(JSON.stringify(data)),
                }),
            );
        } catch (err) {
            if (err instanceof GoneException) {
                // Client disconnected before the reply arrived — safe to ignore
                this.logger.warn(
                    `Connection ${connectionId} is stale (410 Gone); dropping reply`,
                );
            } else {
                this.logger.error(
                    `Failed to push to connection ${connectionId}: ${(err as Error).message}`,
                );
            }
        }
    }
}
