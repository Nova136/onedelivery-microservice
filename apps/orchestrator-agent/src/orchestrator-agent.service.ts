import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StructuredTool } from "@langchain/core/tools";
import {
    HumanMessage,
    ToolMessage,
    BaseMessage,
    AIMessage,
    SystemMessage,
} from "@langchain/core/messages";
import { MemoryService } from "./modules/memory/memory.service";
import { AgentsClientService } from "./modules/agents-client/agents-client.service";
import { createRouteToLogisticsTool } from "./tools/route-to-logistics.tool";
import { createRouteToResolutionTool } from "./tools/route-to-resolution.tool";
import { createRouteToQaTool } from "./tools/route-to-qa.tool";
import { createSearchInternalSopTool } from "./tools/search-internal-sop.tool";
import { createSearchFaqTool } from "./tools/search-faq.tool";
import { createEscalateToHumanTool } from "./tools/escalate-to-human.tool";
import { createGetUserRecentOrdersTool } from "./tools/get-user-recent-orders.tool";
import { KnowledgeClientService } from "./modules/knowledge-client/knowledge-client.service";
import { orchestratorPrompt } from "./prompts/orchestrator.prompt";
import { ModerationService } from "./modules/moderation/moderation.service";
import { PrivacyService } from "./modules/privacy/privacy.service";

@Injectable()
export class OrchestratorAgentService {
    private readonly logger = new Logger(OrchestratorAgentService.name);
    private llm: ChatOpenAI;
    private readonly CHAT_HISTORY_WINDOW_SIZE = 6;
    private readonly SUMMARIZE_BATCH_SIZE = 4;
    private readonly MAX_ITERATIONS = 5;

    private orchestratorWithTools: any;
    private prompt: ChatPromptTemplate;
    private tools: Record<string, StructuredTool>;

    constructor(
        private memoryService: MemoryService,
        private agentsClientService: AgentsClientService,
        private knowledgeClientService: KnowledgeClientService,
        private moderationService: ModerationService,
        private privacyService: PrivacyService,
    ) {
        this.tools = {
            Route_To_Logistics: createRouteToLogisticsTool(
                this.agentsClientService,
            ),
            Route_To_Resolution: createRouteToResolutionTool(
                this.agentsClientService,
            ),
            Route_To_QA: createRouteToQaTool(this.agentsClientService),
            Search_Internal_SOP: createSearchInternalSopTool(
                this.knowledgeClientService,
            ),
            Search_FAQ: createSearchFaqTool(this.knowledgeClientService),
            Escalate_To_Human: createEscalateToHumanTool(
                this.agentsClientService,
            ),
            Get_User_Recent_Orders: createGetUserRecentOrdersTool(
                this.agentsClientService,
            ),
        } as Record<string, StructuredTool>;
        // 1. Initialize the LLM
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0,
        });

        // 2. Set up the prompt template
        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", orchestratorPrompt],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        // 3. Bind the tools to the LLM
        this.orchestratorWithTools = this.llm.bindTools(
            Object.values(this.tools),
        );
    }

    async processChat(
        userId: string,
        sessionId: string,
        message: string,
        activeOrderId: string = "None",
        knownIssue: string = "None",
    ): Promise<string> {
        this.logger.log(`[${userId}] User Message: "${message}"`);

        // 1. PII Redaction
        const scrubbedMessage = this.privacyService.redactPii(message);
        this.logger.log(`[${userId}] Scrubbed Message: "${scrubbedMessage}"`);

        // 2. Validate Input (Guardrails)
        const isSafe = await this.validateInput(userId, scrubbedMessage);
        if (!isSafe) {
            return "I am sorry, but I cannot process that request as it violates our usage guidelines. Please rephrase your query.";
        }

        // 3. Prepare Context and Save User Message
        const { contextWindow, humanMessageSequence } =
            await this.prepareContext(userId, sessionId, scrubbedMessage);

        // 4. Execute Multi-Step Agent Reasoning Loop
        const finalAiMessage = await this.executeReasoningLoop(
            userId,
            sessionId,
            scrubbedMessage,
            activeOrderId,
            knownIssue,
            contextWindow,
        );

        // 5. Extract and Sanitize Final Response
        const finalResponseString =
            await this.extractFinalResponse(finalAiMessage);

        // 6. Save Final AI Message to Database
        await this.saveFinalResponse(
            userId,
            sessionId,
            humanMessageSequence,
            finalAiMessage,
            finalResponseString,
        );

        return finalResponseString;
    }

    /**
     * Validates the user input against moderation guardrails to prevent injection or abuse.
     */
    private async validateInput(
        userId: string,
        message: string,
    ): Promise<boolean> {
        this.logger.log(`[${userId}] Running Input Validation...`);
        const inputValidationResult =
            await this.moderationService.validateInput(message);

        if (!inputValidationResult.safe) {
            this.logger.warn(
                `[${userId}] Input validation failed. Reason: ${inputValidationResult.reason}`,
            );
            return false;
        }
        return true;
    }

    /**
     * Retrieves chat history, applies sliding window & rolling summarization,
     * and persists the current user message to the database.
     */
    private async prepareContext(
        userId: string,
        sessionId: string,
        message: string,
    ) {
        const chatHistory = await this.memoryService.getChatHistory(
            userId,
            sessionId,
        );

        const chatMessages = chatHistory.messages.map((row) => {
            if (row.type === "human") return new HumanMessage(row.content);
            if (row.type === "ai") return new AIMessage(row.content);
            if (row.type === "tool")
                return new ToolMessage({
                    content: row.content,
                    tool_call_id: row.toolCallId ?? "",
                });
            return new SystemMessage(row.content);
        });

        const contextWindow = await this.getContext(
            sessionId,
            chatMessages,
            chatHistory.summary,
            chatHistory.lastSummarizedSequence,
        );

        // Add current user message to the context window
        const userMessage = new HumanMessage(message);
        const humanMessageSequence = chatHistory.messages.length + 1;
        contextWindow.push(userMessage);

        // Save the user message to the DB asynchronously
        await this.memoryService.saveHistory(
            userId,
            sessionId,
            humanMessageSequence,
            userMessage,
        );

        return { contextWindow, humanMessageSequence };
    }

    /**
     * The core agent loop. Iterates up to MAX_ITERATIONS to allow the LLM to call tools,
     * evaluate its own drafted output, and finalize a response.
     */
    private async executeReasoningLoop(
        userId: string,
        sessionId: string,
        message: string,
        activeOrderId: string,
        knownIssue: string,
        contextWindow: BaseMessage[],
    ): Promise<BaseMessage | undefined> {
        let finalAiMessage: BaseMessage | undefined;
        const scratchpad: BaseMessage[] = [];
        let circuitBreakerTriggered = false;

        for (let i = 0; i < this.MAX_ITERATIONS; i++) {
            this.logger.log(`[${userId}] Iteration ${i + 1}: Thinking...`);

            const formattedPrompt = await this.prompt.formatMessages({
                chat_history: contextWindow,
                input: message,
                agent_scratchpad: scratchpad,
                userId: userId,
                sessionId: sessionId,
                activeOrderId: activeOrderId,
                knownIssue: knownIssue,
            });

            const response =
                await this.orchestratorWithTools.invoke(formattedPrompt);

            // Log LLM's internal thoughts for observability
            if (response.content && String(response.content).length > 0) {
                this.logger.log(`[${userId}] Thought: ${response.content}`);
            }

            // If the LLM didn't call any tools, it's ready to draft a response
            if (!response.tool_calls || response.tool_calls.length === 0) {
                this.logger.log(
                    `[${userId}] Agent drafted a response. Running Output Evaluation...`,
                );

                const draftContent = response.content
                    ? String(response.content)
                    : "";

                // Build recent context for output evaluation to prevent context collapse
                const recentContext = contextWindow
                    .map(
                        (msg) =>
                            `${msg instanceof HumanMessage ? "User" : "AI"}: ${msg.content}`,
                    )
                    .join("\n");
                const evaluationContext = recentContext
                    ? `${recentContext}\nUser: ${message}`
                    : `User: ${message}`;

                const outputEvaluationResult =
                    await this.moderationService.evaluateOutput(
                        evaluationContext,
                        draftContent,
                    );

                if (outputEvaluationResult.approved) {
                    this.logger.log(
                        `[${userId}] Output Evaluator approved response.`,
                    );
                    finalAiMessage = response;
                    break;
                } else if (i === this.MAX_ITERATIONS - 1) {
                    this.logger.error(
                        `[${userId}] Max iterations reached. AI failed to clear Output Evaluator. Overriding.`,
                    );
                    finalAiMessage = new AIMessage({
                        content:
                            "I'm sorry, I am having trouble formatting my response right now. Could you please rephrase your question, or would you like to speak to a human?",
                    });
                    break;
                } else {
                    this.logger.warn(
                        `[${userId}] Output Evaluator rejected response. Feedback: ${outputEvaluationResult.feedback}`,
                    );

                    // Push feedback back into the scratchpad to force a correction retry
                    scratchpad.push(response);
                    scratchpad.push(
                        new SystemMessage({
                            content: `SYSTEM ALERT (Output Evaluator): Your previous draft was REJECTED. Reason: ${outputEvaluationResult.feedback}. You must rewrite your response to the user fixing this issue.`,
                        }),
                    );
                    continue;
                }
            }

            // Append LLM tool intent to scratchpad
            scratchpad.push(response);

            // Execute requested tools
            for (const toolCall of response.tool_calls) {
                const selectedTool = this.tools[toolCall.name];

                if (selectedTool) {
                    this.logger.log(
                        `[${userId}] Calling Tool "${toolCall.name}" with args: ${JSON.stringify(toolCall.args)}`,
                    );
                    const agentReply = await selectedTool.invoke(toolCall.args);
                    const replyString = String(agentReply);
                    this.logger.log(
                        `[${userId}] Tool Output: "${replyString}"`,
                    );

                    // Circuit Breaker: Stop hallucination spirals if a critical backend system fails
                    if (replyString.startsWith("System Error:")) {
                        this.logger.error(
                            `[${userId}] Circuit Breaker Triggered by tool ${toolCall.name}: ${replyString}`,
                        );
                        finalAiMessage = new AIMessage({
                            content:
                                "I apologize, but our systems are currently experiencing technical difficulties and I cannot complete your request. Please try again later or contact our human support team.",
                        });
                        circuitBreakerTriggered = true;
                        break;
                    }

                    scratchpad.push(
                        new ToolMessage({
                            content: replyString,
                            tool_call_id: toolCall.id,
                        }),
                    );
                } else {
                    this.logger.warn(
                        `[${userId}] Agent tried to call unknown tool: ${toolCall.name}`,
                    );
                    scratchpad.push(
                        new ToolMessage({
                            content: "Error: Tool not found",
                            tool_call_id: toolCall.id,
                        }),
                    );
                }
            }

            // Break the outer loop if a circuit breaker event occurred during tool execution
            if (circuitBreakerTriggered) break;
        }

        return finalAiMessage;
    }

    /**
     * Extracts the text from the final AI message and strips out any
     * hidden <thinking> tags to provide a clean customer experience.
     */
    private extractFinalResponse(
        finalAiMessage: BaseMessage | undefined,
    ): string {
        let finalResponseString = finalAiMessage?.content
            ? String(finalAiMessage.content)
            : "I'm sorry, I encountered an error and couldn't complete the request.";

        // Strip out the hidden reasoning tags for a clean customer experience
        finalResponseString = finalResponseString
            .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
            .trim();

        return finalResponseString;
    }

    /**
     * Persists the cleaned AI response back to the chat history database.
     */
    private async saveFinalResponse(
        userId: string,
        sessionId: string,
        humanMessageSequence: number,
        finalAiMessage: BaseMessage | undefined,
        finalResponseString: string,
    ): Promise<void> {
        if (finalAiMessage) {
            // Overwrite content with the cleaned string so the DB doesn't store the raw <thinking> tags
            finalAiMessage.content = finalResponseString;
            const aiMessageSequence = humanMessageSequence + 1;

            await this.memoryService.saveHistory(
                userId,
                sessionId,
                aiMessageSequence,
                finalAiMessage,
            );
        }

        this.logger.log(
            `[${userId}] Final Clean Reply to Frontend: "${finalResponseString}"`,
        );
    }

    async getContext(
        sessionId: string,
        chatMessages: BaseMessage[],
        currentSummary: string,
        lastSummarizedSequence: number,
    ): Promise<BaseMessage[]> {
        // Split messages into "recent window" and "older overflow"
        const overflowMessages = chatMessages.slice(
            0,
            Math.max(0, chatMessages.length - this.CHAT_HISTORY_WINDOW_SIZE),
        );
        const recentMessages = chatMessages.slice(
            -this.CHAT_HISTORY_WINDOW_SIZE,
        );

        const unsummarizedOverflow = overflowMessages.slice(
            lastSummarizedSequence,
        );

        // 3. Trigger Summarization if we have overflow
        if (
            unsummarizedOverflow.length >= this.SUMMARIZE_BATCH_SIZE ||
            (lastSummarizedSequence === 0 && overflowMessages.length > 0)
        ) {
            this.logger.log(
                `Batch summarizing ${unsummarizedOverflow.length} older messages...`,
            );

            // Pass the OLD summary + ONLY the NEW unsummarized messages to maintain continuity
            currentSummary = await this.memoryService.summarizeConversation(
                unsummarizedOverflow,
                currentSummary, // Pass existing summary to the summarizer LLM
            );

            // Update the sequence marker to cover ONLY the overflow we just summarized
            lastSummarizedSequence += unsummarizedOverflow.length;

            this.memoryService.updateSessionSummary(
                sessionId,
                currentSummary,
                lastSummarizedSequence,
            );
        }

        // 4. Construct the Final Prompt Context
        // This is what the LLM actually reasons with
        const finalContext: BaseMessage[] = [];

        if (currentSummary) {
            finalContext.push(
                new SystemMessage(`[CONTEXT SUMMARY]: ${currentSummary}`),
            );
        }

        // Add any older overflow messages that haven't triggered a batch summary yet
        const pendingOverflow = overflowMessages.slice(lastSummarizedSequence);
        finalContext.push(...pendingOverflow);

        // Add the sliding window of raw messages
        finalContext.push(...recentMessages);

        return finalContext;
    }
}
