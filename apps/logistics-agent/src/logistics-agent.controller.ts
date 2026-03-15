// src/logistics-agent.controller.ts
import { Controller, Post, Body, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { LogisticsAgentService } from "./logistics-agent.service";
import { ExecuteLogisticsTaskDto } from "./core/dto/execute-logistics-task.dto";
import { AgentChatPayload } from "./core/interface";

// Update the pattern to reflect a backend task rather than a chat
export const AGENT_CHAT_PATTERN = { cmd: "agent.chat" as const };

@ApiTags("Logistics Agent (Backend)")
@Controller("logistics") // Adding a route prefix is good practice for REST fallback
export class LogisticsAgentController {
    private readonly logger = new Logger(LogisticsAgentController.name);

    constructor(private readonly logisticService: LogisticsAgentService) {}

    // TCP Microservice Endpoint
    @MessagePattern(AGENT_CHAT_PATTERN)
    async handleAgentTask(@Payload() rawPayload: AgentChatPayload) {
        this.logger.log(
            `[TCP] Received raw payload from Orchestrator for user: ${rawPayload.userId}`,
        );

        let parsedLogisticsData: ExecuteLogisticsTaskDto;

        // 1. Safely parse the JSON string from the LLM
        try {
            parsedLogisticsData = JSON.parse(rawPayload.message);
        } catch (error) {
            this.logger.error(
                `[TCP] Failed to parse logistics JSON: ${rawPayload.message}`,
                error,
            );
            return {
                reply: "REJECTED: Logistics agent received a malformed data payload from the Orchestrator.",
            };
        }

        this.logger.log(
            `[TCP] Executing '${parsedLogisticsData.action}' for order ${parsedLogisticsData.orderId || "N/A"} (User: ${rawPayload.userId})`,
        );

        // 2. Map the parsed data into the structured DTO your service needs
        // We prioritize the userId/sessionId from the root payload for security
        const executeDto = {
            action: parsedLogisticsData.action,
            userId: rawPayload.userId,
            sessionId: rawPayload.sessionId,
            orderId: parsedLogisticsData.orderId,
            description: parsedLogisticsData.description,
        };

        // 3. Pass the clean, parsed object to your backend service!
        const reply = await this.logisticService.executeTask(executeDto);

        return { reply };
    }

    // HTTP REST Endpoint (For testing via Postman)
    @Post("execute")
    @ApiOperation({
        summary: "Execute a stateless logistics task (e.g., cancel_order)",
    })
    @ApiResponse({
        status: 200,
        description: "The result of the logistics operation.",
    })
    async handleIncomingTask(@Body() requestData: ExecuteLogisticsTaskDto) {
        this.logger.log(
            `[HTTP] Executing '${requestData.action}' for order ${requestData.orderId || "N/A"} (User: ${requestData.userId})`,
        );

        // Changed from processChat to executeTask
        const result = await this.logisticService.executeTask(requestData);

        return { reply: result };
    }
}
