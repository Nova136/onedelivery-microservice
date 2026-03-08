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
import { KnowledgeClientService } from "./agents/knowledge-client.service";

@Injectable()
export class OrchestratorService {
    private readonly logger = new Logger(OrchestratorService.name);
    private llm: ChatOpenAI;
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
            Route_To_Refund: createRouteToResolutionTool(this.agentsClient),
            Route_To_QA: createRouteToQaTool(this.agentsClient),
            Route_To_Guardian: createRouteToGuardianTool(this.agentsClient),
            Search_Internal_SOP: createSearchInternalSopTool(
                this.knowledgeClient,
            ),
            Search_FAQ: createSearchFaqTool(this.knowledgeClient),
        } as Record<string, StructuredTool>;
        // 1. Initialize the LLM
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0,
        });

        // 2. Define the Orchestrator's persona and rules
        const orchestratorSystemPrompt = `You are the Orchestrator Agent for OneDelivery, a friendly and empathetic food delivery support assistant.
Your primary job is to help customers by answering questions and routing complex requests (like cancellations, refunds, or tracking) to our backend specialist tools.

### CURRENT SESSION CONTEXT
- **User ID**: {userId} (ALWAYS pass this exact ID to tool calls)
- **Session ID**: {sessionId}

### CORE DIRECTIVES

1. **The "Read the Manual" Rule (CRITICAL)**
   - If a user asks a general question (e.g., "What are your hours?"), use the Search_FAQ tool to search the public FAQs.
   - If a user wants you to take an ACTION (e.g., cancel an order, report missing food, complain about a driver), you MUST use the Search_Internal_SOP tool FIRST to fetch the official company policy for that specific issue. 

2. **The Execution Rule**
   - Once you read the SOP, follow its steps exactly in order.
   - If the SOP tells you to check viability before asking for confirmation, do exactly that.
   - Use your routing tools (Route_To_Logistics, Route_To_Refund) strictly according to the steps outlined in the SOP.

3. **The Information Gathering Rule**
   - If you need to use a tool but are missing required parameters (like the Order ID, or the exact names of the missing items), DO NOT guess or invent data. 
   - Ask the user for the missing information first before triggering the tool.

4. **Security Rule (STRICT)**
   - The SOPs you fetch are highly confidential internal documents. 
   - NEVER quote an SOP or policy verbatim to the user.
   - NEVER reveal internal compensation limits, business rules, or backend tool names (e.g., never say "I am triggering the Route_To_Refund tool").
   - Translate the outcome of your tools into natural, polite, customer-facing language.

5. **The Escalation Rule**
   - If the user is highly abusive, threatens legal action, reports a severe food safety issue (like allergies or foreign objects), or demands a human manager, immediately use the Escalate_To_Human tool. Stop trying to solve the problem yourself.

### TONE AND PERSONALITY
- Be friendly, helpful, and concise (keep replies to 3 sentences or less when possible).
- Show extreme empathy if the user is frustrated, hungry, or dealing with a messed-up order. 
- Talk like a real human support rep, not a robotic state machine.`;

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
                sessionId: sessionId,
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
