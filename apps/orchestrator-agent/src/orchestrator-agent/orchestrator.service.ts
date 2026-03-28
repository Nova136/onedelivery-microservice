import { Injectable, Inject } from "@nestjs/common";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { WebSocket } from "ws";
import { MemoryClientService } from "../modules/clients/memory-client/memory-client.service";
import { PiiRedactionService } from "../modules/pii-redaction/pii-redaction.service";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";

@Injectable()
export class OrchestratorService {
    constructor(
        @Inject("ORCHESTRATOR_GRAPH") private readonly graph: any,
        @Inject("WS_CLIENTS") private clients: Map<string, WebSocket>,
        private readonly memoryService: MemoryClientService,
        private readonly piiService: PiiRedactionService,
        private readonly outputEvaluator: OutputEvaluatorService,
    ) {}

    /**
     * Core chat processing logic
     */
    async processChat(
        userId: string,
        sessionId: string | undefined,
        message: string,
    ) {
        const session = await this.memoryService.getChatHistory(
            userId,
            sessionId,
        );

        // Redact PII from the user's message before it enters the graph
        const redactedMessage = await this.piiService.redact(message);
        const humanMessage = new HumanMessage(redactedMessage);

        // Save human message to history
        await this.memoryService.saveHistory(
            userId,
            session.id,
            session.messages?.length || 0,
            humanMessage,
        );

        // Run the graph using the checkpointer (PostgresSaver)
        const result = await this.graph.invoke(
            {
                messages: [humanMessage],
                user_id: userId,
                session_id: session.id,
                // Reset layers for the new turn
                layers: [],
            },
            {
                configurable: { thread_id: session.id },
            },
        );

        const lastAIMessage = result.messages[result.messages.length - 1];

        // Save AI message to history
        await this.memoryService.saveHistory(
            userId,
            session.id,
            (session.messages?.length || 0) + 1,
            lastAIMessage,
        );

        // Update session summary
        if (result.summary && result.summary !== session.summary) {
            await this.memoryService.updateSessionSummary(
                session.id,
                result.summary,
                0,
            );
        }

        return {
            sessionId: session.id,
            response: lastAIMessage.content,
            summary: result.summary,
            current_category: result.current_category,
            intent_queue: result.intent_queue,
            order_states: result.order_states,
            user_orders: result.user_orders,
            layers: result.layers,
        };
    }

    /**
     * Core agent callback logic
     */
    async processAgentCallback(
        sessionId: string,
        result: string,
        status: string,
        agentType: string,
        requestId?: string,
        metadata?: any,
    ) {
        // 1. Redact PII from the agent's result
        const redactedResult = await this.piiService.redact(result);

        // Build a more descriptive message to avoid ambiguity for multiple requests
        // We no longer convey the agent name to the end user
        // We prioritize Order ID if available, else use Request ID
        const orderId = metadata?.orderId;
        const identifier = orderId || requestId;
        const idLabel = orderId ? "Order ID" : "Request ID";

        let messageContent = `Status: ${status || "Completed"}.`;
        if (identifier) {
            messageContent += ` ${idLabel}: ${identifier}.`;
        }
        messageContent += ` Result: ${redactedResult}`;

        // 2. Evaluate the message for safety/leakage
        const evaluation = await this.outputEvaluator.evaluateOutput(
            messageContent,
            "Background Agent Callback",
            `Agent: ${agentType}, Status: ${status}, ID: ${identifier || "N/A"}`,
        );

        if (!evaluation.isSafe) {
            console.warn(
                `Agent Callback for session ${sessionId} rejected by evaluator: ${evaluation.issues?.join(", ")}`,
            );
            // If it's not safe, we still update the graph state but maybe with a redacted/safe version or just log it
            // For now, let's just not send it to the user if it's unsafe
            return { success: false, reason: "Output evaluation failed" };
        }

        // Update LangGraph state in Postgres instead of saving to ChatMessage entity
        const aiMessage = new AIMessage(messageContent);
        await this.graph.updateState(
            {
                configurable: { thread_id: sessionId },
            },
            {
                messages: [aiMessage],
            },
        );

        // Save to persistent history for UI
        const session = await this.memoryService.getChatHistory("", sessionId);
        await this.memoryService.saveHistory(
            "",
            sessionId,
            session.messages?.length || 0,
            aiMessage,
        );

        // Send via WebSocket
        const ws = this.clients.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    type: "AGENT_UPDATE",
                    sessionId: sessionId,
                    content: messageContent,
                    agent: agentType,
                }),
            );
        }

        return { success: true };
    }
}
