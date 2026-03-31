import { Injectable, Inject, Logger } from "@nestjs/common";
import { HumanMessage } from "@langchain/core/messages";
import { MemoryClientService } from "../modules/clients/memory-client/memory-client.service";
import { PiiRedactionService } from "../modules/pii-redaction/pii-redaction.service";
import { PromptShieldService } from "../modules/prompt-shield/prompt-shield.service";
import { InputValidatorService } from "../modules/input-validator/input-validator.service";

@Injectable()
export class OrchestratorService {
    private readonly logger = new Logger(OrchestratorService.name);

    constructor(
        @Inject("ORCHESTRATOR_GRAPH") private readonly graph: any,
        @Inject("AGENT_CALLBACK_GRAPH") private readonly callbackGraph: any,
        private readonly memoryService: MemoryClientService,
        private readonly piiService: PiiRedactionService,
        private readonly promptShield: PromptShieldService,
        private readonly inputValidator: InputValidatorService,
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

        // Check if the session is already human-managed or closed from DB status
        const status = session.status?.toLowerCase();
        if (status === "closed" || status === "escalated") {
            this.logger.log(
                `Session ${session.id} is ${status}. Bypassing AI graph.`,
            );
            return {
                sessionId: session.id,
                response: null,
                summary: session.summary,
                current_intent: null,
                order_states: {},
                user_orders: [],
            };
        }

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

        // 1. Validate the input and check for prompt injections FIRST
        const [validationResult, isSuspicious] = await Promise.all([
            this.inputValidator.validateMessage(redactedMessage),
            this.promptShield.isSuspicious(redactedMessage),
        ]);

        if (!validationResult.isValid || isSuspicious) {
            // 2. Log to a security audit (do NOT save to active chat history)
            const reason = isSuspicious
                ? "Prompt Injection Detected"
                : validationResult.error;
            this.logger.warn(
                `Security threat detected from user ${userId}: [${reason}] ${redactedMessage}`,
            );

            // 3. Return the pivot message immediately without invoking the graph
            const pivotMessage =
                "I'm sorry, I'm specialized in assisting with OneDelivery's services and don't have information regarding my internal operations or out-of-scope topics. I'd be happy to help you with your orders or our delivery policies instead. What can I do for you today?";

            return {
                sessionId: session.id,
                response: pivotMessage,
                summary: session.summary,
                current_intent: null,
                order_states: {},
                user_orders: [],
            };
        }

        // Run the graph using the checkpointer (PostgresSaver)
        const result = await this.graph.invoke(
            {
                messages: [humanMessage],
                user_id: userId,
                session_id: session.id,
            },
            {
                configurable: { thread_id: session.id },
                recursionLimit: 25,
            },
        );

        const lastAIMessage = result.messages[result.messages.length - 1];
        this.logger.log(
            `Final Response for session ${session.id}: ${lastAIMessage.content}`,
        );

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
     * Processes updates from external agents/services
     */
    async processAgentCallback(
        sessionId: string,
        userId: string,
        message: string,
    ) {
        // 1. Get session from DB to check status
        const session = await this.memoryService.getChatHistory(
            userId,
            sessionId,
        );
        const status = session.status?.toLowerCase();

        // If human-managed or closed, bypass the callback graph
        if (status === "closed" || status === "escalated") {
            this.logger.log(
                `Session ${sessionId} is ${status}. Bypassing agent callback graph.`,
            );
            return {
                success: true,
                messageContent: null,
                isSafe: true,
            };
        }

        // 2. Get current state for context
        const state = await this.getSessionState(sessionId);
        const result = await this.callbackGraph.invoke(
            {
                agent_message: message,
                summary: state.summary || "",
                user_id: userId,
                session_id: sessionId,
            },
            {
                configurable: { thread_id: sessionId },
                recursionLimit: 10,
            },
        );

        if (!result.is_safe) {
            this.logger.warn(
                `Agent update for session ${sessionId} failed safety check. Falling back to safe message.`,
            );
            result.synthesized_message =
                "We received an update regarding your request, but our system is currently verifying the details. Please check back shortly.";
        }

        this.logger.log(
            `Final Callback Response for session ${sessionId}: ${result.synthesized_message}`,
        );

        return {
            success: true,
            messageContent: result.synthesized_message,
            isSafe: result.is_safe,
        };
    }
}
