import { Injectable, Logger } from "@nestjs/common";
import {
    HumanMessage,
    ToolMessage,
    BaseMessage,
    AIMessage,
    SystemMessage,
} from "@langchain/core/messages";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { MemoryService } from "./modules/memory/memory.service";
import { ModerationService } from "./modules/moderation/moderation.service";
import { PrivacyService } from "./modules/privacy/privacy.service";
import { McpToolRegistryService } from "./modules/mcp/mcp-tool-registry.service";
import { SemanticRouterService } from "./modules/semantic-router/semantic-router.service";
import { GraphState } from "./state/graph.state";
import { SpecializedAgentsService } from "./modules/specialized-agents/specialized-agents.service";

@Injectable()
export class OrchestratorAgentService {
    private readonly logger = new Logger(OrchestratorAgentService.name);
    private readonly CHAT_HISTORY_WINDOW_SIZE = 5;
    private readonly SUMMARIZE_BATCH_SIZE = 2;
    private readonly MAX_ITERATIONS = 10;

    private graph: any;

    // In-memory Dialog State Tracking (DST) for deterministic routing.
    // In a production environment, this would be persisted in Redis or a DB.
    private sessionStates = new Map<string, "IDLE" | "AWAITING_ACTION">();

    constructor(
        private memoryService: MemoryService,
        private moderationService: ModerationService,
        private privacyService: PrivacyService,
        private mcpToolRegistry: McpToolRegistryService,
        private semanticRouterService: SemanticRouterService,
        private specializedAgentsService: SpecializedAgentsService,
    ) {
        // 1. Compile the LangGraph workflow
        this.graph = this.createGraph();
        console.log(this.getMermaidGraph());
    }

    /**
     * Returns the Mermaid syntax representation of the LangGraph state machine.
     */
    public getMermaidGraph(): string {
        return this.graph.getGraph().drawMermaid();
    }

    private createGraph() {
        const routerNode = async (state: typeof GraphState.State) => {
            // --- DETERMINISTIC STATE MACHINE: BYPASS ---
            const currentState =
                this.sessionStates.get(state.sessionId) || "IDLE";

            if (currentState === "AWAITING_ACTION") {
                this.logger.log(
                    `[${state.userId}] Deterministic State Bypass: Routing directly to Action Agent for Slot Filling.`,
                );
                return {
                    intent: "ACTION",
                    activeToolNames: ["Search_Internal_SOP"],
                };
            }
            // -------------------------------------------

            // 1. Search backward through the context window for the last AI Message
            let lastAiMessage = "None";
            for (let i = state.contextWindow.length - 1; i >= 0; i--) {
                const msg = state.contextWindow[i];
                if (msg instanceof AIMessage) {
                    lastAiMessage = String(msg.content);
                    break;
                }
            }

            this.logger.log(
                `[${state.userId}] Router using lastAiMessage: "${lastAiMessage}"`,
            );

            // 2. Pass it down to your service!
            return await this.semanticRouterService.classifyIntent(
                state.userId,
                state.message,
                lastAiMessage, // <-- Injecting it here
            );
        };

        const actionAgentNode = async (state: typeof GraphState.State) =>
            this.specializedAgentsService.invokeActionAgent(state);
        const faqAgentNode = async (state: typeof GraphState.State) =>
            this.specializedAgentsService.invokeFaqAgent(state);

        const escalationNode = async (state: typeof GraphState.State) => {
            const lastMessage = state.scratchpad[state.scratchpad.length - 1];
            if (lastMessage instanceof ToolMessage) {
                return {
                    scratchpad: [
                        new AIMessage(
                            "I am transferring you to a human support agent now. They will review your chat history and be with you shortly.",
                        ),
                    ],
                };
            }
            return {
                scratchpad: [
                    new AIMessage({
                        content: "",
                        tool_calls: [
                            {
                                id: "call_escalate_" + Date.now(),
                                name: "Escalate_To_Human",
                                args: {
                                    userId: state.userId,
                                    sessionId: state.sessionId,
                                    message:
                                        "User requested human agent escalation.",
                                },
                            },
                        ],
                    }),
                ],
            };
        };

        const endSessionNode = async (state: typeof GraphState.State) => {
            const lastMessage = state.scratchpad[state.scratchpad.length - 1];
            if (lastMessage instanceof ToolMessage) {
                return {
                    scratchpad: [
                        new AIMessage(
                            "Thank you for contacting OneDelivery. Have a great day!",
                        ),
                    ],
                };
            }
            return {
                scratchpad: [
                    new AIMessage({
                        content: "",
                        tool_calls: [
                            {
                                id: "call_end_session_" + Date.now(),
                                name: "End_Chat_Session",
                                args: {
                                    userId: state.userId,
                                    sessionId: state.sessionId,
                                },
                            },
                        ],
                    }),
                ],
            };
        };

        const unknownIntentNode = async (state: typeof GraphState.State) => {
            return {
                scratchpad: [
                    new AIMessage(
                        "I'm sorry, but I can only assist with OneDelivery-related queries such as food orders, refunds, and general FAQ. How can I help you with your delivery today?",
                    ),
                ],
            };
        };

        const toolsNode = async (state: typeof GraphState.State) => {
            const lastMessage = state.scratchpad[
                state.scratchpad.length - 1
            ] as AIMessage;
            const newScratchpad: BaseMessage[] = [];
            const newActiveToolNames: string[] = [];
            let circuitBreakerTriggered = false;
            let finalAiMessage: BaseMessage | undefined = undefined;

            for (const toolCall of lastMessage.tool_calls || []) {
                const selectedTool = this.mcpToolRegistry.getTool(
                    toolCall.name,
                );
                if (selectedTool) {
                    this.logger.log(
                        `[${state.userId}] Calling Tool "${toolCall.name}" with args: ${JSON.stringify(toolCall.args)}`,
                    );

                    let replyString = "";
                    try {
                        const agentReply = await selectedTool.invoke(
                            toolCall.args,
                        );
                        replyString = String(agentReply);
                        this.logger.log(
                            `[${state.userId}] Tool Output: "${replyString.length > 200 ? replyString.substring(0, 200) + "... (truncated)" : replyString}"`,
                        );
                    } catch (error) {
                        this.logger.error(
                            `[${state.userId}] Uncaught Exception in tool ${toolCall.name}: ${error instanceof Error ? error.message : String(error)}`,
                            error instanceof Error ? error.stack : undefined,
                        );
                        finalAiMessage = new AIMessage({
                            content:
                                "I apologize, but our systems are currently experiencing technical difficulties and I cannot complete your request. Please try again later or contact our human support team.",
                        });
                        circuitBreakerTriggered = true;
                        break;
                    }

                    for (const availableTool of this.mcpToolRegistry.getAvailableToolNames()) {
                        const toolRegex = new RegExp(`\\b${availableTool}\\b`);
                        if (
                            toolRegex.test(replyString) &&
                            !state.activeToolNames.includes(availableTool)
                        ) {
                            this.logger.log(
                                `[${state.userId}] Dynamic Tool Binding: SOP unlocked restricted tool -> "${availableTool}"`,
                            );
                            newActiveToolNames.push(availableTool);
                        }
                    }

                    if (replyString.startsWith("System Error:")) {
                        this.logger.error(
                            `[${state.userId}] Circuit Breaker Triggered by tool ${toolCall.name}: ${replyString}`,
                        );
                        finalAiMessage = new AIMessage({
                            content:
                                "I apologize, but our systems are currently experiencing technical difficulties and I cannot complete your request. Please try again later or contact our human support team.",
                        });
                        circuitBreakerTriggered = true;
                        break;
                    }

                    newScratchpad.push(
                        new ToolMessage({
                            content: replyString,
                            tool_call_id: toolCall.id,
                        }),
                    );
                } else {
                    this.logger.warn(
                        `[${state.userId}] Agent tried to call unknown tool: ${toolCall.name}`,
                    );
                    newScratchpad.push(
                        new ToolMessage({
                            content: "Error: Tool not found",
                            tool_call_id: toolCall.id,
                        }),
                    );
                }
            }

            return {
                scratchpad: newScratchpad,
                activeToolNames: newActiveToolNames,
                circuitBreakerTriggered,
                finalAiMessage,
            };
        };

        const evaluatorNode = async (state: typeof GraphState.State) => {
            this.logger.log(
                `[${state.userId}] Agent drafted a response. Running Output Evaluation...`,
            );
            const lastMessage = state.scratchpad[
                state.scratchpad.length - 1
            ] as AIMessage;
            let draftContent = lastMessage.content
                ? String(lastMessage.content)
                : "";

            // Strip out thinking tags so the evaluator doesn't falsely flag internal reasoning
            draftContent = draftContent
                .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
                .replace(/<sop_complete\/>/g, "")
                .trim();

            // Safely extract the compressed rolling summary without passing the full raw history
            const summaryMessage = state.contextWindow.find(
                (msg) =>
                    msg instanceof SystemMessage &&
                    String(msg.content).startsWith("[CONTEXT SUMMARY]"),
            );
            const sessionSummary = summaryMessage
                ? String(summaryMessage.content)
                : "None";

            // Extract a clean transcript of the recent sliding window, omitting bulky tool/system messages
            const recentTranscript = state.contextWindow
                .filter(
                    (msg) =>
                        msg instanceof HumanMessage || msg instanceof AIMessage,
                )
                .map(
                    (msg) =>
                        `${msg instanceof HumanMessage ? "User" : "AI"}: ${msg.content}`,
                )
                .join("\n");

            const recentContext = `Active Order ID: ${state.activeOrderId}\nSession Summary: ${sessionSummary}\nRecent Conversation:\n${recentTranscript || "None"}\nCurrent User Request: ${state.message}`;

            const scratchpadContext = state.scratchpad
                .map((msg) => {
                    if (
                        msg instanceof AIMessage &&
                        msg.tool_calls &&
                        msg.tool_calls.length > 0
                    ) {
                        const tools = msg.tool_calls
                            .map((t) => t.name)
                            .join(", ");
                        return `[AI Action]: Called Tool -> ${tools}`;
                    } else if (msg instanceof ToolMessage) {
                        return `[Backend Response]: ${msg.content}`;
                    }
                    return "";
                })
                .filter((str) => str.length > 0)
                .join("\n");

            const evaluationContext = [
                recentContext,
                scratchpadContext
                    ? `\n--- CURRENT BACKEND ACTIONS ---\n${scratchpadContext}`
                    : "",
            ]
                .filter(Boolean)
                .join("\n");

            const outputEvaluationResult =
                await this.moderationService.evaluateOutput(
                    evaluationContext,
                    draftContent,
                );

            if (outputEvaluationResult.approved) {
                this.logger.log(
                    `[${state.userId}] Output Evaluator approved response.`,
                );
                return { finalAiMessage: lastMessage };
            } else if (state.iterations >= this.MAX_ITERATIONS) {
                this.logger.error(
                    `[${state.userId}] Max iterations reached. AI failed to clear Output Evaluator. Overriding.`,
                );
                return {
                    finalAiMessage: new AIMessage({
                        content:
                            "I'm sorry, I am having trouble formatting my response right now. Could you please rephrase your question, or would you like to speak to a human?",
                    }),
                };
            } else {
                this.logger.warn(
                    `[${state.userId}] Output Evaluator rejected response. Feedback: ${outputEvaluationResult.feedback}`,
                );
                return {
                    scratchpad: [
                        new SystemMessage({
                            content: `SYSTEM ALERT (Output Evaluator): Your previous draft was REJECTED. Reason: ${outputEvaluationResult.feedback}. You must rewrite your response to the user fixing this issue.`,
                        }),
                    ],
                };
            }
        };

        const fastTrackFinalizerNode = async (
            state: typeof GraphState.State,
        ) => {
            const lastMessage = state.scratchpad[
                state.scratchpad.length - 1
            ] as AIMessage;
            return { finalAiMessage: lastMessage };
        };

        const checkToolCalls = (state: typeof GraphState.State) => {
            const lastMessage = state.scratchpad[
                state.scratchpad.length - 1
            ] as AIMessage;

            // --- LLM BAILOUT EVALUATION ---
            if (String(lastMessage.content).includes("BAILOUT_TRIGGERED")) {
                this.logger.warn(
                    `[${state.userId}] LLM Bailout Triggered! Drastic context change detected.`,
                );
                // Clear the state so the semantic router doesn't get bypassed again
                this.sessionStates.set(state.sessionId, "IDLE");
                return "router";
            }
            // ------------------------------

            return lastMessage.tool_calls?.length ? "tools" : "evaluator";
        };

        const checkFastTrackToolCalls = (state: typeof GraphState.State) => {
            const lastMessage = state.scratchpad[
                state.scratchpad.length - 1
            ] as AIMessage;
            return lastMessage.tool_calls?.length
                ? "tools"
                : "fastTrackFinalizer";
        };

        const routeBackToAgent = (state: typeof GraphState.State) => {
            if (state.intent === "FAQ") return "faqAgent";
            if (state.intent === "ESCALATE") return "escalation";
            if (state.intent === "END_SESSION") return "endSession";
            if (state.intent === "UNKNOWN") return "unknownIntent";
            return "actionAgent";
        };

        return new StateGraph(GraphState)
            .addNode("router", routerNode.bind(this))
            .addNode("actionAgent", actionAgentNode.bind(this))
            .addNode("faqAgent", faqAgentNode.bind(this))
            .addNode("escalation", escalationNode.bind(this))
            .addNode("endSession", endSessionNode.bind(this))
            .addNode("unknownIntent", unknownIntentNode.bind(this))
            .addNode("tools", toolsNode.bind(this))
            .addNode("evaluator", evaluatorNode.bind(this))
            .addNode("fastTrackFinalizer", fastTrackFinalizerNode.bind(this))
            .addEdge(START, "router")
            .addConditionalEdges("router", (state) => routeBackToAgent(state), {
                actionAgent: "actionAgent",
                faqAgent: "faqAgent",
                escalation: "escalation",
                endSession: "endSession",
                unknownIntent: "unknownIntent",
            })
            .addConditionalEdges("actionAgent", checkToolCalls, {
                router: "router",
                tools: "tools",
                evaluator: "evaluator",
            })
            .addConditionalEdges("faqAgent", checkFastTrackToolCalls, {
                tools: "tools",
                fastTrackFinalizer: "fastTrackFinalizer",
            })
            .addConditionalEdges("escalation", checkFastTrackToolCalls, {
                tools: "tools",
                fastTrackFinalizer: "fastTrackFinalizer",
            })
            .addConditionalEdges("endSession", checkFastTrackToolCalls, {
                tools: "tools",
                fastTrackFinalizer: "fastTrackFinalizer",
            })
            .addConditionalEdges("unknownIntent", checkFastTrackToolCalls, {
                tools: "tools",
                fastTrackFinalizer: "fastTrackFinalizer",
            })
            .addEdge("fastTrackFinalizer", END)
            .addConditionalEdges(
                "tools",
                (state) =>
                    state.circuitBreakerTriggered
                        ? END
                        : routeBackToAgent(state),
                {
                    [END]: END,
                    actionAgent: "actionAgent",
                    faqAgent: "faqAgent",
                    escalation: "escalation",
                    endSession: "endSession",
                    unknownIntent: "unknownIntent",
                },
            )
            .addConditionalEdges(
                "evaluator",
                (state) =>
                    state.finalAiMessage ? END : routeBackToAgent(state),
                {
                    [END]: END,
                    actionAgent: "actionAgent",
                    faqAgent: "faqAgent",
                    escalation: "escalation",
                    endSession: "endSession",
                    unknownIntent: "unknownIntent",
                },
            )
            .compile();
    }

    async processChat(
        userId: string,
        sessionId: string,
        message: string,
        activeOrderId: string = "None",
    ): Promise<string> {
        // 1. PII Redaction
        const { redactedText, token } = await this.privacyService.redactPii(message);

        // 2. Validate Input (Guardrails)
        const isSafe = await this.validateInput(userId, redactedText);
        if (!isSafe) {
            return "I am sorry, but I cannot process that request as it violates our usage guidelines. Please rephrase your query.";
        }

        // 3. Prepare Context and Save User Message
        const { contextWindow, humanMessageSequence } =
            await this.prepareContext(userId, sessionId, redactedText);

        let finalAiMessage: BaseMessage | undefined = undefined;
        let scratchpad: BaseMessage[] = [];
        let resultIntent = "";

        try {
            // 4. Execute Multi-Step Agent Reasoning Loop
            const result = await this.executeReasoningLoop(
                userId,
                sessionId,
                redactedText,
                activeOrderId,
                contextWindow,
            );
            finalAiMessage = result.finalAiMessage;
            scratchpad = result.scratchpad;
            resultIntent = result.intent;
        } catch (error) {
            this.logger.error(
                `[${userId}] Graph execution crashed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error.stack : undefined,
            );
            return "I apologize, but our systems are currently experiencing technical difficulties and I cannot complete your request. Please try again later.";
        }

        let currentSequence = humanMessageSequence;

        // 4b. Extract tool narrative and save as a SystemMessage
        const toolNarrative = scratchpad
            .map((msg) => {
                if (
                    msg instanceof AIMessage &&
                    msg.tool_calls &&
                    msg.tool_calls.length > 0
                ) {
                    const tools = msg.tool_calls
                        .map((t) => `${t.name}(${JSON.stringify(t.args)})`)
                        .join(", ");
                    return `[ACTION TAKEN]: ${tools}`;
                }
                if (msg instanceof ToolMessage) {
                    return `[ACTION RESULT]: ${msg.content}`;
                }
                return "";
            })
            .filter(Boolean)
            .join("\n");

        if (toolNarrative) {
            currentSequence++;
            await this.memoryService.saveHistory(
                userId,
                sessionId,
                currentSequence,
                new SystemMessage(
                    `--- PREVIOUS BACKEND ACTIONS ---\n${toolNarrative}`,
                ),
            );
        }

        // 5. Extract and Sanitize Final Response
        const finalResponseString = this.extractFinalResponse(finalAiMessage);

        // Check if the agent signalled that the SOP is complete
        const rawContent = finalAiMessage?.content
            ? String(finalAiMessage.content)
            .
            : "";
        const isSopCompleted = rawContent.includes("<sop_complete/>");

        // 7. Update Session State (Deterministic Slot-Filling)
        if (resultIntent === "ACTION" && !isSopCompleted) {
            this.sessionStates.set(sessionId, "AWAITING_ACTION");
            this.logger.log(
                `[${userId}] State Machine: Locked into AWAITING_ACTION slot-filling loop.`,
            );
        } else {
            if (
                this.sessionStates.get(sessionId) === "AWAITING_ACTION" &&
                isSopCompleted
            ) {
                this.logger.log(
                    `[${userId}] State Machine: SOP completed successfully. Resetting routing state to IDLE.`,
                );
            }
            this.sessionStates.set(sessionId, "IDLE");
        }

        // 6. Save Final AI Message to Database
        await this.saveFinalResponse(
            userId,
            sessionId,
            currentSequence,
            finalAiMessage,
            finalResponseString,
            token,
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
        contextWindow: BaseMessage[],
    ): Promise<{
        finalAiMessage: BaseMessage | undefined;
        scratchpad: BaseMessage[];
        intent: string;
    }> {
        const initialState = {
            contextWindow,
            scratchpad: [],
            activeToolNames: [],
            circuitBreakerTriggered: false,
            iterations: 0,
            finalAiMessage: undefined,
            userId,
            sessionId,
            activeOrderId,
            message,
            intent: "",
        };

        const finalState = await this.graph.invoke(initialState, {
            runName: "Orchestrator_Agent_Loop",
            configurable: {
                thread_id: sessionId,
            },
            metadata: {
                userId,
                sessionId,
                activeOrderId,
            },
        });
        return {
            finalAiMessage: finalState.finalAiMessage,
            scratchpad: finalState.scratchpad,
            intent: finalState.intent,
        };
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
            .replace(/BAILOUT_TRIGGERED/g, "")
            .replace(/<sop_complete\/>/g, "")
            .trim();

        return finalResponseString;
    }

    /**
     * Persists the cleaned AI response back to the chat history database.
     */
    private async saveFinalResponse(
        userId: string,
        sessionId: string,
        currentSequence: number,
        finalAiMessage: BaseMessage | undefined,
        finalResponseString: string,
        token: string,
    ): Promise<void> {
        if (finalAiMessage) {
            // Overwrite content with the cleaned string so the DB doesn't store the raw <thinking> tags
            finalAiMessage.content = await this.privacyService.deanonymizePii(finalResponseString, token);
            const aiMessageSequence = currentSequence + 1;

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
        // 1. Group messages into conversational chunks (a chunk starts with a HumanMessage)
        const chunks: BaseMessage[][] = [];
        let currentChunk: BaseMessage[] = [];

        for (const msg of chatMessages) {
            if (msg instanceof HumanMessage) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                }
                currentChunk = [msg];
            } else {
                currentChunk.push(msg);
            }
        }
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        // 2. Split chunks into "recent window" and "older overflow"
        const overflowChunks = chunks.slice(
            0,
            Math.max(0, chunks.length - this.CHAT_HISTORY_WINDOW_SIZE),
        );
        const recentChunks = chunks.slice(-this.CHAT_HISTORY_WINDOW_SIZE);

        const unsummarizedOverflowChunks = overflowChunks.slice(
            lastSummarizedSequence,
        );

        // 3. Trigger Summarization if we have overflow
        if (
            unsummarizedOverflowChunks.length >= this.SUMMARIZE_BATCH_SIZE ||
            (lastSummarizedSequence === 0 && overflowChunks.length > 0)
        ) {
            this.logger.log(
                `Batch summarizing ${unsummarizedOverflowChunks.length} older message chunks...`,
            );

            const messagesToSummarize = unsummarizedOverflowChunks.flat();

            // FIRE AND FORGET: Do not block the user's request waiting for background summarization
            this.memoryService
                .summarizeConversation(messagesToSummarize, currentSummary)
                .then((newSummary) => {
                    const newSequence =
                        lastSummarizedSequence +
                        unsummarizedOverflowChunks.length;
                    this.memoryService.updateSessionSummary(
                        sessionId,
                        newSummary,
                        newSequence,
                    );
                })
                .catch((err) =>
                    this.logger.error("Background summarization failed", err),
                );

            // The current request will proceed using the existing summary for this turn.
        }

        // 4. Construct the Final Prompt Context
        // This is what the LLM actually reasons with
        const finalContext: BaseMessage[] = [];

        if (currentSummary) {
            finalContext.push(
                new SystemMessage(`[CONTEXT SUMMARY]: ${currentSummary}`),
            );
        }

        // Add any older overflow chunks that haven't triggered a batch summary yet
        const pendingOverflowChunks = overflowChunks.slice(
            lastSummarizedSequence,
        );
        finalContext.push(...pendingOverflowChunks.flat());

        // Add the sliding window of raw message chunks
        finalContext.push(...recentChunks.flat());

        return finalContext;
    }
}
