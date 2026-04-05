import { Logger, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

@Injectable()
export class OrchestratorGateway {
    private readonly logger = new Logger(OrchestratorGateway.name);
    private readonly endpoint: string;
    private readonly client: ApiGatewayManagementApiClient;

    constructor(private readonly configService: ConfigService) {
        this.endpoint = this.configService.get<string>(
            "WEBSOCKET_API_ENDPOINT",
        );
        this.client = new ApiGatewayManagementApiClient({
            endpoint: this.endpoint,
            region:
                this.configService.get<string>("AWS_REGION") ??
                "ap-southeast-1",
        });
    }

    async sendAgentUpdate(
        connectionIds: string[],
        sessionId: string,
        messageContent: string,
        responseType: "USER_UPDATE" | "AGENT_UPDATE" | "ADMIN_UPDATE",
    ) {
        const payload = JSON.stringify({
            reply: messageContent,
            sessionId,
            responseType,
        });
        const pushPromises = connectionIds.map(async (connId) => {
            try {
                if (this.endpoint.startsWith("http://")) {
                    // Local dev: plain HTTP POST — no AWS credentials needed
                    await axios.post(
                        `${this.endpoint}/@connections/${connId}`,
                        payload,
                        { headers: { "Content-Type": "application/json" } },
                    );
                } else {
                    // Production: AWS API Gateway Management API (SigV4 signed)
                    await this.client.send(
                        new PostToConnectionCommand({
                            ConnectionId: connId,
                            Data: Buffer.from(payload),
                        }),
                    );
                }
            } catch (error) {
                this.logger.error(
                    `Failed to push update to connection ${connId}:`,
                    error instanceof Error ? error.message : error,
                );
            }
        });

        await Promise.allSettled(pushPromises);
    }
}
