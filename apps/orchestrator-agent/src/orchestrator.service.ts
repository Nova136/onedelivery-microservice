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
} from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";
import { routeToLogisticsTool } from "./tools/route-to-logistics.tool";
import { routeToResolutionTool } from "./tools/route-to-resolution.tool";

@Injectable()
export class OrchestratorService {
    private readonly logger = new Logger(OrchestratorService.name);
    private llm: ChatOpenAI;
    private orchestratorWithTools: any;
    private prompt: ChatPromptTemplate;
    private tools: Record<string, StructuredTool> = {
        Route_To_Logistics: routeToLogisticsTool,
        Route_To_Refund: routeToResolutionTool,
    };

    constructor(private memoryService: MemoryService) {
        console.log("API Key");
        console.log(process.env.OPENAI_API_KEY);

        // 1. Initialize the LLM
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0,
        });

        // 2. Define the Orchestrator's persona and rules
        const orchestratorSystemPrompt = `You are the Orchestrator Agent for OneDelivery, a food delivery support assistant.
Your role is to triage customer requests and route them to the appropriate specialist tool.

### CURRENT CONTEXT
- **User ID**: {userId} (ALWAYS pass this exact ID to tool calls)
- **Session ID**: {sessionId} 

### GUIDELINES
1. **Route_To_Logistics**: Use for "Where is my order?", tracking, cancellations, address changes, or delivery policy.
2. **Route_To_Refund**: Use for "Missing items", "Wrong order", "Cold food", refund requests, or refund status.
3. **Gather Information**: If the user's intent implies a tool call but is missing required parameters (like Order ID), DO NOT guess. ASK the user for the missing information first.
4. **Synthesize tool outputs**: When a tool returns data, summarize it naturally for the user. Never invent order details or policies. Always use the exact data the tool provides.
5. **Tone**: Be helpful, concise (max 3 sentences), and empathetic if the user is frustrated. Always confirm with the user that their issue is resolved or if they need further assistance.`;

        // 3. Set up the prompt template
        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", orchestratorSystemPrompt],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        // 4. Bind the tools to the LLM
        this.orchestratorWithTools = this.llm.bindTools(
            Object.values(this.tools),
        );
    }

    async processChat(
        userId: string,
        sessionId: string,
        message: string,
    ): Promise<string> {
        this.logger.log(`[${userId}] User Message: "${message}"`);

        // 1. Fetch the past conversation from the database
        const chatHistory = await this.memoryService.getHistory(
            userId,
            sessionId,
        );

        // 2. Add the user's brand new message to the history
        const newHumanMessage = new HumanMessage(message);
        chatHistory.push(newHumanMessage);

        let finalAiMessage: BaseMessage | undefined;
        const scratchpad: BaseMessage[] = [];

        // 3. Loop for multi-step processing (Agent Loop)
        // We limit to 5 iterations to prevent infinite loops
        for (let i = 0; i < 5; i++) {
            this.logger.log(`[${userId}] Iteration ${i + 1}: Thinking...`);

            const formattedPrompt = await this.prompt.formatMessages({
                chat_history: chatHistory,
                input: message,
                agent_scratchpad: scratchpad,
                userId: userId,
            });

            const response =
                await this.orchestratorWithTools.invoke(formattedPrompt);

            // If no tool calls, we are done
            if (!response.tool_calls || response.tool_calls.length === 0) {
                this.logger.log(
                    `[${userId}] Agent decided to respond directly.`,
                );
                finalAiMessage = response;
                break;
            }

            // Execute the tool
            const toolCall = response.tool_calls[0];
            const selectedTool = this.tools[toolCall.name];

            if (selectedTool) {
                this.logger.log(
                    `[${userId}] Calling Tool "${toolCall.name}" with args: ${JSON.stringify(toolCall.args)}`,
                );
                const agentReply = await selectedTool.invoke(toolCall.args);
                this.logger.log(`[${userId}] Tool Output: "${agentReply}"`);
                const toolMessage = new ToolMessage({
                    content: String(agentReply),
                    tool_call_id: toolCall.id,
                });

                // Add the AI's request and the Tool's response to the scratchpad for the next iteration
                scratchpad.push(response);
                scratchpad.push(toolMessage);
            } else {
                this.logger.warn(
                    `[${userId}] Agent tried to call unknown tool: ${toolCall.name}`,
                );
                // Handle invalid tool name
                scratchpad.push(response);
                scratchpad.push(
                    new ToolMessage({
                        content: "Error: Tool not found",
                        tool_call_id: toolCall.id,
                    }),
                );
            }
        }

        // 7. Append the AI's final reply to our history array
        if (finalAiMessage) {
            chatHistory.push(finalAiMessage);
        }

        // 8. Save the fully updated conversation back to the database!
        await this.memoryService.saveHistory(userId, sessionId, chatHistory);

        this.logger.log(
            `[${userId}] Final Reply: "${finalAiMessage?.content}"`,
        );

        return (
            (finalAiMessage?.content as string) ||
            "I'm sorry, I encountered an error."
        );
    }
}
