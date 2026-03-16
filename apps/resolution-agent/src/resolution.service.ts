import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StructuredTool } from "@langchain/core/tools";
import { ToolMessage, BaseMessage } from "@langchain/core/messages";
import { AgentsClientService } from "./agents/agents-client.service";
import { KnowledgeClientService } from "./agents/knowledge-client.service";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";
import { createGetOrderDetailsTool } from "./tools/get-order-details.tool";
import { createExecuteRefundTool } from "./tools/execute-refund.tool";
import { createRouteToGuardianTool } from "./tools/route-to-guardian.tool";
import { resolutionPrompt } from "./core/prompt/resolution.prompt";

@Injectable()
export class ResolutionService {
    private readonly logger = new Logger(ResolutionService.name);
    private llm: ChatOpenAI;
    private agentWithTools: any;
    private prompt: ChatPromptTemplate;
    private tools: Record<string, StructuredTool>;

    constructor(
        private agentsClient: AgentsClientService,
        private knowledgeClient: KnowledgeClientService,
    ) {
        this.tools = {
            Get_Order_Details: createGetOrderDetailsTool(this.agentsClient),
            Execute_Refund: createExecuteRefundTool(this.agentsClient),
            Route_To_Guardian: createRouteToGuardianTool(this.agentsClient),
        } as Record<string, StructuredTool>;

        this.llm = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });

        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", resolutionPrompt],
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        this.agentWithTools = this.llm.bindTools(Object.values(this.tools));
    }

    async processRefund(payload: AgentChatPayload): Promise<string> {
        const { userId, sessionId, message } = payload;
        this.logger.log(`[${userId}] Starting refund process...`);

        // Fetch SOP dynamically before entering the execution loop
        const sop = await this.knowledgeClient.searchInternalSop({
            intentCode: "PROCESS_REFUND_LOGIC",
            requestingAgent: "refund_agent",
        });

        let finalMessage: BaseMessage | undefined;
        const scratchpad: BaseMessage[] = [];

        // Agent loop
        for (let i = 0; i < 5; i++) {
            this.logger.log(`[${userId}] Iteration ${i + 1}`);

            const formattedPrompt = await this.prompt.formatMessages({
                input: message,
                agent_scratchpad: scratchpad,
                userId: userId,
                sessionId: sessionId,
                sop: sop,
            });

            const response = await this.agentWithTools.invoke(formattedPrompt);

            if (response.content && String(response.content).length > 0) {
                this.logger.log(`[${userId}] Thought: ${response.content}`);
            }

            if (!response.tool_calls || response.tool_calls.length === 0) {
                finalMessage = response;
                break;
            }

            scratchpad.push(response);

            for (const toolCall of response.tool_calls) {
                const tool = this.tools[toolCall.name];
                if (tool) {
                    this.logger.log(
                        `[${userId}] Calling Tool "${toolCall.name}" with args: ${JSON.stringify(toolCall.args)}`,
                    );
                    const toolOutput = await tool.invoke(toolCall.args);
                    this.logger.log(`[${userId}] Tool Output: "${toolOutput}"`);
                    scratchpad.push(
                        new ToolMessage({
                            content: String(toolOutput),
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

        const result =
            (finalMessage?.content as string) ||
            "REJECTED: Agent failed to reach a conclusion.";

        this.logger.log(`[${userId}] Final Result: "${result}"`);
        return result;
    }
}
