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
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { MemoryService } from "./modules/memory/memory.service";
import { ORCHESTRATOR_PROMPT } from "./prompts/orchestrator.prompt";
import { ModerationService } from "./modules/moderation/moderation.service";
import { PrivacyService } from "./modules/privacy/privacy.service";
import { McpToolRegistryService } from "./modules/mcp/mcp-tool-registry.service";

export const GraphState = Annotation.Root({
    contextWindow: Annotation<BaseMessage[]>({
        reducer: (x, y) => y ?? x,
        default: () => [],
    }),
    scratchpad: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    activeToolNames: Annotation<string[]>({
        reducer: (x, y) => Array.from(new Set([...x, ...y])),
        default: () => [],
    }),
    circuitBreakerTriggered: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false,
    }),
    iterations: Annotation<number>({
        reducer: (x, y) => x + y,
        default: () => 0,
    }),
    finalAiMessage: Annotation<BaseMessage | undefined>({
        reducer: (x, y) => y ?? x,
        default: () => undefined,
    }),
    userId: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    sessionId: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    activeOrderId: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    message: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
});

@Injectable()
export class OrchestratorAgentService {
    private readonly logger = new Logger(OrchestratorAgentService.name);
    private llm: ChatOpenAI;
    private readonly CHAT_HISTORY_WINDOW_SIZE = 6;
    private readonly SUMMARIZE_BATCH_SIZE = 4;
    private readonly MAX_ITERATIONS = 10;

    private prompt: ChatPromptTemplate;
    private graph: any;

    constructor(
        private memoryService: MemoryService,
        private moderationService: ModerationService,
        private privacyService: PrivacyService,
        private mcpToolRegistry: McpToolRegistryService,
    ) {
        // 1. Initialize the LLM
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0,
        });

        // 2. Set up the prompt template
        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", ORCHESTRATOR_PROMPT],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        // 3. Compile the LangGraph workflow
        this.graph = this.createGraph();
    }

    private createGraph() {
        const agentNode = async (state: typeof GraphState.State) => {
            this.logger.log(
                `[${state.userId}] Iteration ${state.iterations + 1}: Thinking...`,
            );

            const currentTools = Array.from(state.activeToolNames)
                .map((name) => this.mcpToolRegistry.getTool(name))
                .filter(Boolean) as StructuredTool[];
            const orchestratorWithTools = this.llm.bindTools(currentTools);

            const formattedPrompt = await this.prompt.formatMessages({
                chat_history: state.contextWindow,
                input: state.message,
                agent_scratchpad: state.scratchpad,
                userId: state.userId,
                sessionId: state.sessionId,
                activeOrderId: state.activeOrderId,
            });

            const response =
                await orchestratorWithTools.invoke(formattedPrompt);

            if (response.content && String(response.content).length > 0) {
                this.logger.log(
                    `[${state.userId}] Thought: ${response.content}`,
                );
            }

            return {
                scratchpad: [response],
                iterations: 1, // Let the graph reducer increment our internal step counter
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
                    const agentReply = await selectedTool.invoke(toolCall.args);
                    const replyString = String(agentReply);
                    this.logger.log(
                        `[${state.userId}] Tool Output: "${replyString.length > 200 ? replyString.substring(0, 200) + "... (truncated)" : replyString}"`,
                    );

                    for (const availableTool of this.mcpToolRegistry.getAvailableToolNames()) {
                        if (
                            replyString.includes(availableTool) &&
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
                .trim();

            const recentContext = state.contextWindow
                .map(
                    (msg) =>
                        `${msg instanceof HumanMessage ? "User" : "AI"}: ${msg.content}`,
                )
                .join("\n");

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

        return new StateGraph(GraphState)
            .addNode("agent", agentNode.bind(this))
            .addNode("tools", toolsNode.bind(this))
            .addNode("evaluator", evaluatorNode.bind(this))
            .addEdge(START, "agent")
            .addConditionalEdges("agent", (state) => {
                const lastMessage = state.scratchpad[
                    state.scratchpad.length - 1
                ] as AIMessage;
                return lastMessage.tool_calls?.length ? "tools" : "evaluator";
            })
            .addConditionalEdges("tools", (state) =>
                state.circuitBreakerTriggered ? END : "agent",
            )
            .addConditionalEdges("evaluator", (state) =>
                state.finalAiMessage ? END : "agent",
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
        const scrubbedMessage = this.privacyService.redactPii(message);

        // 2. Validate Input (Guardrails)
        const isSafe = await this.validateInput(userId, scrubbedMessage);
        if (!isSafe) {
            return "I am sorry, but I cannot process that request as it violates our usage guidelines. Please rephrase your query.";
        }

        // 3. Prepare Context and Save User Message
        const { contextWindow, humanMessageSequence } =
            await this.prepareContext(userId, sessionId, scrubbedMessage);

        // 4. Execute Multi-Step Agent Reasoning Loop
        const { finalAiMessage, scratchpad } = await this.executeReasoningLoop(
            userId,
            sessionId,
            scrubbedMessage,
            activeOrderId,
            contextWindow,
        );

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

        // 6. Save Final AI Message to Database
        await this.saveFinalResponse(
            userId,
            sessionId,
            currentSequence,
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
    }> {
        const initialState = {
            contextWindow,
            scratchpad: [],
            activeToolNames: [
                "Search_Internal_SOP",
                "Search_FAQ",
                "Escalate_To_Human",
                "End_Chat_Session",
            ],
            circuitBreakerTriggered: false,
            iterations: 0,
            finalAiMessage: undefined,
            userId,
            sessionId,
            activeOrderId,
            message,
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
    ): Promise<void> {
        if (finalAiMessage) {
            // Overwrite content with the cleaned string so the DB doesn't store the raw <thinking> tags
            finalAiMessage.content = finalResponseString;
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

            // Pass the OLD summary + ONLY the NEW unsummarized messages to maintain continuity
            currentSummary = await this.memoryService.summarizeConversation(
                messagesToSummarize,
                currentSummary, // Pass existing summary to the summarizer LLM
            );

            // Update the sequence marker to cover ONLY the overflow chunks we just summarized
            lastSummarizedSequence += unsummarizedOverflowChunks.length;

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
