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
} from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";
import { AgentsClientService } from "./modules/agents-client/agents-client.service";
import { createRouteToLogisticsTool } from "./tools/route-to-logistics.tool";
import { createRouteToResolutionTool } from "./tools/route-to-resolution.tool";
import { createRouteToQaTool } from "./tools/route-to-qa.tool";
import { createRouteToGuardianTool } from "./tools/route-to-guardian.tool";
import { createSearchInternalSopTool } from "./tools/search-internal-sop.tool";
import { createSearchFaqTool } from "./tools/search-faq.tool";
import { createEscalateToHumanTool } from "./tools/escalate-to-human.tool";
import { createGetUserRecentOrdersTool } from "./tools/get-user-recent-orders.tool";
import { KnowledgeClientService } from "./modules/knowledge-client/knowledge-client.service";
import { orchestratorPrompt } from "./prompts/orchestrator.prompt";
import { ModerationService } from "./modules/moderation/moderation.service";

@Injectable()
export class OrchestratorAgentService {
    private readonly logger = new Logger(OrchestratorAgentService.name);
    private llm: ChatOpenAI;
    private readonly CHAT_HISTORY_WINDOW_SIZE = 10; // Keeps the last 5 pairs of (human, ai) messages

    private orchestratorWithTools: any;
    private prompt: ChatPromptTemplate;
    private tools: Record<string, StructuredTool>;

    constructor(
        private memoryService: MemoryService,
        private agentsClientService: AgentsClientService,
        private knowledgeClientService: KnowledgeClientService,
        private moderationService: ModerationService,
    ) {
        this.tools = {
            Route_To_Logistics: createRouteToLogisticsTool(
                this.agentsClientService,
            ),
            Route_To_Resolution: createRouteToResolutionTool(
                this.agentsClientService,
            ),
            Route_To_QA: createRouteToQaTool(this.agentsClientService),
            Route_To_Guardian: createRouteToGuardianTool(
                this.agentsClientService,
            ),
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
            modelName: "gpt-4o",
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

        // 1. Guardrail / Input Sanitization Check
        this.logger.log(
            `[${userId}] drafted a message. Running Input Validation...`,
        );
        const inputValidationResult =
            await this.moderationService.validateInput(message);
        if (!inputValidationResult.safe) {
            this.logger.warn(
                `[${userId}] Input validation failed. Blocked Reason input: "${message}". Reason: ${inputValidationResult.reason}`,
            );
            return "I am sorry, but I cannot process that request as it violates our usage guidelines. Please rephrase your query.";
        }

        // Fetch the past conversation from the database
        const chatHistory = await this.memoryService.getHistory(
            userId,
            sessionId,
        );

        // Add the user's brand new message to the history
        const newHumanMessage = new HumanMessage(message);
        chatHistory.push(newHumanMessage);
        await this.memoryService.saveHistory(
            userId,
            sessionId,
            chatHistory.length,
            newHumanMessage,
        );

        // Token-saving: only use a window of the most recent messages for the prompt
        const historyWindow = chatHistory.slice(-this.CHAT_HISTORY_WINDOW_SIZE);

        let finalAiMessage: BaseMessage | undefined;
        const scratchpad: BaseMessage[] = [];

        // Loop for multi-step processing (Agent Loop)
        // We limit to 5 iterations to prevent infinite loops
        let circuitBreakerTriggered = false;
        for (let i = 0; i < 5; i++) {
            this.logger.log(`[${userId}] Iteration ${i + 1}: Thinking...`);

            const formattedPrompt = await this.prompt.formatMessages({
                chat_history: historyWindow, // Use the windowed history
                input: message,
                agent_scratchpad: scratchpad,
                userId: userId,
                sessionId: sessionId,
                activeOrderId: activeOrderId,
                knownIssue: knownIssue,
            });

            const response =
                await this.orchestratorWithTools.invoke(formattedPrompt);

            // If the model returns a thought in the content, log it for observability
            if (response.content && String(response.content).length > 0) {
                this.logger.log(`[${userId}] Thought: ${response.content}`);
            }

            // If no tool calls, we are done
            if (!response.tool_calls || response.tool_calls.length === 0) {
                this.logger.log(
                    `[${userId}] Agent drafted a response. Running Output Evaluation...`,
                );

                const draftContent = response.content
                    ? String(response.content)
                    : "";

                // Build a short conversation transcript for the evaluator to prevent context collapse
                const recentContext = historyWindow
                    .map(
                        (msg) =>
                            `${msg._getType() === "human" ? "User" : "AI"}: ${msg.content}`,
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

                // If the critic approves, or if we are out of iterations, accept the response
                if (outputEvaluationResult.approved || i === 4) {
                    this.logger.log(
                        `[${userId}] Output Evaluation approved response.`,
                    );
                    finalAiMessage = response;
                    break;
                } else {
                    this.logger.warn(
                        `[${userId}] Output Evaluation rejected response. Feedback: ${outputEvaluationResult.feedback}`,
                    );

                    // Add the drafted response and the critic's feedback to the scratchpad to force a retry
                    scratchpad.push(response);
                    scratchpad.push(
                        new HumanMessage({
                            content: `System Output Evaluation Feedback: Your previous draft was rejected. Reason: ${outputEvaluationResult.feedback}. Please correct your response.`,
                        }),
                    );

                    continue;
                }
            }

            // Add the assistant message with tool_calls first (API requires tool messages to follow this)
            scratchpad.push(response);

            // Execute each tool call and add a ToolMessage for each (API requires one ToolMessage per tool_call_id)
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

                    // Circuit Breaker Pattern: Intercept critical system errors to prevent LLM hallucinations
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

            // Break the outer reasoning loop if the circuit breaker was triggered
            if (circuitBreakerTriggered) {
                break;
            }
        }

        let finalResponseString = finalAiMessage?.content
            ? String(finalAiMessage.content)
            : "I'm sorry, I encountered an error and couldn't complete the request.";

        // Strip out the hidden reasoning tags!
        finalResponseString = finalResponseString
            .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
            .trim();

        // Before replying to human, guardian verifies the response against SOP
        const verificationMessage = `Verify this response before it is sent to the customer. Customer's message: "${message}". Proposed response: "${finalResponseString}". Ensure it is accurate, follows SOP, and is appropriate to send.`;
        const guardianVerified = await this.agentsClientService.send("guardian", {
            userId,
            sessionId: `${sessionId}-verify`,
            message: verificationMessage,
        });
        const guardianReply = guardianVerified || finalResponseString;
        finalResponseString = guardianReply.startsWith("CORRECTED: ")
            ? guardianReply.replace("CORRECTED: ", "").replace(/\[.*?\]$/, "").trim()
            : guardianReply;
        this.logger.log(`[${userId}] Guardian Verified Reply: "${finalResponseString}"`);

        // Save the CLEAN conversation back to the database safely!
        if (finalAiMessage) {
            // Overwrite the content with the cleaned string so the DB doesn't store the <thinking> tags
            finalAiMessage.content = finalResponseString;
            chatHistory.push(finalAiMessage);
            await this.memoryService.saveHistory(
                userId,
                sessionId,
                chatHistory.length,
                finalAiMessage,
            );
        }

        this.logger.log(
            `[${userId}] Final Clean Reply to Frontend: "${finalResponseString}"`,
        );

        return finalResponseString;
    }

    async getHistoryListing(userId: string) {
        return await this.memoryService.getHistoryListing(userId);
    }

    async getChatHistory(userId: string, sessionId: string) {
        return await this.memoryService.getChatHistory(userId, sessionId);
    }
}
