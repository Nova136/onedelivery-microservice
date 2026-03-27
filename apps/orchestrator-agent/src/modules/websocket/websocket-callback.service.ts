import { Injectable, Logger } from "@nestjs/common";
import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
    GoneException,
} from "@aws-sdk/client-apigatewaymanagementapi";

/**
 * Pushes replies back to WebSocket clients.
 *
 * Two modes selected automatically via WEBSOCKET_API_ENDPOINT:
 *
 *   Production (AWS):
 *     WEBSOCKET_API_ENDPOINT=https://{id}.execute-api.{region}.amazonaws.com/prod
 *     Uses @aws-sdk/client-apigatewaymanagementapi with SigV4 (IAM task role).
 *
 *   Local dev (ws-gateway container):
 *     WEBSOCKET_API_ENDPOINT=http://ws-gateway:3015
 *     Uses plain HTTP POST /connections/:connectionId (no SigV4).
 *
 * When WEBSOCKET_API_ENDPOINT is unset the service is a no-op so the
 * orchestrator-agent can still be used over plain HTTP without any changes.
 */
@Injectable()
export class WebsocketCallbackService {
    private readonly logger = new Logger(WebsocketCallbackService.name);
    private readonly endpoint: string | null;
    private readonly isLocal: boolean;
    private readonly awsClient: ApiGatewayManagementApiClient | null;

    constructor() {
        this.endpoint = process.env.WEBSOCKET_API_ENDPOINT ?? null;
        // Local when pointing at plain http:// (ws-gateway dev container)
        this.isLocal = !!this.endpoint && this.endpoint.startsWith("http://");

        if (!this.endpoint) {
            this.logger.warn(
                "WEBSOCKET_API_ENDPOINT not set — WebSocket push is disabled",
            );
            this.awsClient = null;
        } else if (this.isLocal) {
            this.logger.log(
                `WebSocket push → local ws-gateway at ${this.endpoint}`,
            );
            this.awsClient = null;
        } else {
            this.awsClient = new ApiGatewayManagementApiClient({
                endpoint: this.endpoint,
                region: process.env.AWS_REGION ?? "ap-southeast-1",
            });
        }
    }

    async pushToConnection(connectionId: string, data: object): Promise<void> {
        if (!this.endpoint) return;

        if (this.isLocal) {
            await this.pushLocal(connectionId, data);
        } else {
            await this.pushAws(connectionId, data);
        }
    }

    // ── Local: plain HTTP POST to ws-gateway ───────────────────────────────────

    private async pushLocal(connectionId: string, data: object): Promise<void> {
        const url = `${this.endpoint}/connections/${connectionId}`;
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (res.status === 410) {
                this.logger.warn(
                    `[local] Connection ${connectionId} is stale (410); dropping reply`,
                );
            } else if (!res.ok) {
                this.logger.error(
                    `[local] Push failed for ${connectionId}: HTTP ${res.status}`,
                );
            }
        } catch (err) {
            this.logger.error(
                `[local] Push error for ${connectionId}: ${(err as Error).message}`,
            );
        }
    }

    // ── Production: AWS API Gateway Management API ─────────────────────────────

    private async pushAws(connectionId: string, data: object): Promise<void> {
        try {
            await this.awsClient!.send(
                new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: Buffer.from(JSON.stringify(data)),
                }),
            );
        } catch (err) {
            if (err instanceof GoneException) {
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
