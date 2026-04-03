import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { OrchestratorService } from "./orchestrator.service";
import { Logger } from "@nestjs/common";

@WebSocketGateway({
    namespace: "/ws",
    cors: {
        origin: "*",
    },
})
export class OrchestratorGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(OrchestratorGateway.name);

    constructor(private readonly orchestratorService: OrchestratorService) {}

    afterInit(_server: Server) {
        this.logger.log("WebSocket Initialized");
    }

    handleConnection(client: Socket, ..._args: any[]) {
        const sessionId = client.handshake.query.sessionId as string;
        if (sessionId) {
            client.join(sessionId);
            this.logger.log(`Client ${client.id} joined room ${sessionId}`);
        }
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    sendAgentUpdate(sessionId: string, messageContent: string | null) {
        if (messageContent) {
            this.logger.log(`Emitting AGENT_UPDATE to session ${sessionId}`);
            this.server.to(sessionId).emit("message", {
                type: "AGENT_UPDATE",
                message: messageContent,
            });
        }
    }

    sendAdminUpdate(sessionId: string, messageContent: string | null) {
        if (messageContent) {
            this.logger.log(`Emitting ADMIN_UPDATE to session ${sessionId}`);
            this.server.to(sessionId).emit("message", {
                type: "ADMIN_UPDATE",
                message: messageContent,
            });
        }
    }

    @SubscribeMessage("message")
    async handleMessage(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        this.logger.log(`Received WebSocket message: ${JSON.stringify(data)}`);
        const sessionId = Array.from(client.rooms).find(
            (room) => room !== client.id,
        );

        try {
            if (data.type === "CHAT_MESSAGE") {
                const { message, userId } = data;

                const result = await this.orchestratorService.processHumanInput(
                    userId,
                    sessionId,
                    message,
                );

                if (result.response) {
                    this.server.to(sessionId).emit("message", {
                        type: "CHAT_RESPONSE",
                        message: result.response,
                    });
                }
            }
        } catch (error) {
            this.logger.error(`WebSocket Message Error: ${error}`);
            if (sessionId) {
                this.server.to(sessionId).emit("message", {
                    type: "ERROR",
                    message: "Failed to process message",
                });
            }
        }
    }
}
