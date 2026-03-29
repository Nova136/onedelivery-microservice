import { Injectable, Inject } from "@nestjs/common";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { MemoryClientService } from "../modules/clients/memory-client/memory-client.service";
import { PiiRedactionService } from "../modules/pii-redaction/pii-redaction.service";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";

@Injectable()
export class OrchestratorService {
    constructor(
        @Inject("ORCHESTRATOR_GRAPH") private readonly graph: any,
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
            current_intent: result.current_intent,
            order_states: result.order_states,
            user_orders: result.user_orders,
        };
    }

    /**
     * Get current graph state for a session
     */
    async getSessionState(sessionId: string) {
        const state = await this.graph.getState({
            configurable: { thread_id: sessionId },
        });
        return state.values;
    }

    /**
     * Core agent callback logic
     */
    async processAgentCallback(
        sessionId: string,
        userId: string,
        message: string,
    ) {
        // 1. Redact PII from the agent's result
        const redactedResult = await this.piiService.redact(message);
        const messageContent = `Result: ${redactedResult}`;

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
        const session = await this.memoryService.getChatHistory(
            userId,
            sessionId,
        );
        await this.memoryService.saveHistory(
            userId,
            sessionId,
            session.messages?.length || 0,
            aiMessage,
        );

        return { success: true, messageContent };
    }
}
