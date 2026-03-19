import { Injectable, Logger, Search } from "@nestjs/common";
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
} from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";
import { AgentsClientService } from "./agents/agents-client.service";
import { createRouteToLogisticsTool } from "./tools/route-to-logistics.tool";
import { createRouteToResolutionTool } from "./tools/route-to-resolution.tool";
import { createRouteToQaTool } from "./tools/route-to-qa.tool";
import { createRouteToGuardianTool } from "./tools/route-to-guardian.tool";
import { createSearchInternalSopTool } from "./tools/search-internal-sop.tool";
import { createSearchFaqTool } from "./tools/search-faq.tool";
import { createEscalateToHumanTool } from "./tools/escalate-to-human.tool";
import { KnowledgeClientService } from "./agents/knowledge-client.service";
import { orchestratorPrompt } from "./core/prompts/orchestrator.prompt";
import { GetChatHistoryListingResponse } from "./core/interface";

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
        private agentsClient: AgentsClientService,
        private knowledgeClient: KnowledgeClientService,
    ) {
        this.tools = {
            Route_To_Logistics: createRouteToLogisticsTool(this.agentsClient),
            Route_To_Resolution: createRouteToResolutionTool(this.agentsClient),
            Route_To_QA: createRouteToQaTool(this.agentsClient),
            Route_To_Guardian: createRouteToGuardianTool(this.agentsClient),
            Search_Internal_SOP: createSearchInternalSopTool(
                this.knowledgeClient,
            ),
            Search_FAQ: createSearchFaqTool(this.knowledgeClient),
            Escalate_To_Human: createEscalateToHumanTool(this.agentsClient),
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
                    `[${userId}] Agent decided to respond directly.`,
                );
                finalAiMessage = response;
                break;
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
                    this.logger.log(`[${userId}] Tool Output: "${agentReply}"`);
                    scratchpad.push(
                        new ToolMessage({
                            content: String(agentReply),
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
        }

        let finalResponseString = finalAiMessage?.content
            ? String(finalAiMessage.content)
            : "I'm sorry, I encountered an error and couldn't complete the request.";

        // Strip out the hidden reasoning tags!
        finalResponseString = finalResponseString
            .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
            .trim();

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
    
    async getHistoryListing(
        userId: string
    ){
        return await this.memoryService.getHistoryListing(userId);
    }

    async getChatHistory(
        userId: string,
        sessionId: string
    ){
        return await this.memoryService.getChatHistory(userId, sessionId);
    }
    
}
