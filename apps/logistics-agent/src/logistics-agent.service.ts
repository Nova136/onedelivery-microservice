import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StructuredTool } from "@langchain/core/tools";
import { ToolMessage, BaseMessage } from "@langchain/core/messages";
import {
    ExecuteLogisticsTaskDto,
    LogisticsAction,
} from "./core/dto/execute-logistics-task.dto";
import { KnowledgeClientService } from "./agents/knowledge-client.service";
import { AgentsClientService } from "./agents/agents-client.service";

import { createGetOrderDetailsTool } from "./tools/get-order-details.tool";
import { createRouteToGuardianTool } from "./tools/route-to-guardian.tool";
import { createExecuteCancellationTool } from "./tools/execute-cancellation.tool";
import { OrderClientService } from "./agents/order-client.service";
import { LOGISTICS_AGENT_PROMPT } from "./prompt/logistics-agent.prompt";
import { traceable } from "langsmith/traceable";

@Injectable()
export class LogisticsAgentService {
    private readonly logger = new Logger(LogisticsAgentService.name);
    private llm: ChatOpenAI;
    private tools: Record<string, StructuredTool>;
    private logisticsWithTools: any;

    constructor(
        private knowledgeClient: KnowledgeClientService,
        private agentsClient: AgentsClientService,
        private orderClient: OrderClientService,
    ) {
        // 1. Initialize the LLM (Temperature 0 is crucial for backend math agents!)
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0,
        });

        // 2. Bind the specific backend tools this agent is allowed to use
        this.tools = {
            Get_Order_Details: createGetOrderDetailsTool(this.orderClient),
            Route_To_Guardian: createRouteToGuardianTool(this.agentsClient),
            Execute_Cancellation_And_Refund: createExecuteCancellationTool(
                this.orderClient,
            ),
        } as Record<string, StructuredTool>;

        this.logisticsWithTools = this.llm.bindTools(Object.values(this.tools));

        // Programmatically wrap the method to avoid SWC/TypeScript decorator metadata issues
        this.executeTask = traceable(this.executeTask.bind(this), {
            name: "LogisticsAgent_ExecuteTask",
            run_type: "chain",
        }) as any;
    }

    async executeTask(payload: ExecuteLogisticsTaskDto): Promise<string> {
        this.logger.log(
            `[${payload.userId}] Waking up Logistics Agent for action: ${payload.action}`,
        );

        // 1. Map the action to the correct SOP Intent Code
        let intentCode = "";
        if (payload.action === LogisticsAction.CANCEL_ORDER) {
            intentCode = "PROCESS_CANCELLATION_LOGIC";
        } else {
            return `REJECTED: Unknown logistics action '${payload.action}'.`;
        }

        // 2. Fetch the exact SOP from the Knowledge service (Just-In-Time injection!)
        let sopContext = "No SOP found.";
        try {
            const rawSop = await this.knowledgeClient.searchInternalSop({
                intentCode,
                requestingAgent: "logistics_agent",
            });
            if (rawSop) {
                sopContext =
                    `WORKFLOW STEPS (FOLLOW EXACTLY):\n${rawSop.workflowSteps.join("\n")}
                `.trim();
            }
        } catch (error) {
            this.logger.error("Failed to fetch SOP", error);
            return "REJECTED: Internal database error while fetching Logistics rules.";
        }

        // 3. Set up the messages array. Notice there is NO chat history here!
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", LOGISTICS_AGENT_PROMPT],
            ["human", "Execute this task. Payload: {input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        const scratchpad: BaseMessage[] = [];
        let finalAiMessage: BaseMessage | undefined;

        // 4. The Stateless Agent Loop
        try {
            for (let i = 0; i < 5; i++) {
                this.logger.log(
                    `[${payload.userId}] Logistics Loop ${i + 1}: Thinking...`,
                );

                const formattedPrompt = await prompt.formatMessages({
                    input: JSON.stringify(payload), // Pass the raw JSON directly to the LLM
                    agent_scratchpad: scratchpad,
                    sopContext,
                    currentSystemTime: new Date().toISOString(),
                });

                const response =
                    await this.logisticsWithTools.invoke(formattedPrompt);

                if (response.content && String(response.content).length > 0) {
                    this.logger.log(
                        `[${payload.userId}] Logistics Thought: ${response.content}`,
                    );
                }

                // If no tool calls, the agent has made its final decision
                if (!response.tool_calls || response.tool_calls.length === 0) {
                    finalAiMessage = response;
                    break;
                }

                scratchpad.push(response);

                // Execute backend tools
                for (const toolCall of response.tool_calls) {
                    const selectedTool = this.tools[toolCall.name];

                    if (selectedTool) {
                        this.logger.log(
                            `[${payload.userId}] Calling Tool "${toolCall.name}"`,
                        );
                        const toolReply = await selectedTool.invoke(
                            toolCall.args,
                        );

                        scratchpad.push(
                            new ToolMessage({
                                content: String(toolReply),
                                tool_call_id: toolCall.id,
                            }),
                        );
                    } else {
                        scratchpad.push(
                            new ToolMessage({
                                content: "Error: Tool not found",
                                tool_call_id: toolCall.id,
                            }),
                        );
                    }
                }
            }
        } catch (error) {
            this.logger.error(
                `[${payload.userId}] Logistics Agent execution failed`,
                error instanceof Error ? error.stack : String(error),
            );
            return "REJECTED: Logistics agent encountered an unexpected system error.";
        }

        // 6. Extract the final answer and strip out the <thinking> tags
        let finalResponseString = finalAiMessage?.content
            ? String(finalAiMessage.content)
            : "REJECTED: Logistics agent encountered an error and timed out.";

        finalResponseString = finalResponseString
            .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
            .trim();

        // Enforce safe fallback to rejection if output format is violated or empty
        if (!finalResponseString) {
            finalResponseString =
                "REJECTED: Logistics agent failed to provide a valid response.";
        } else if (
            !finalResponseString.startsWith("SUCCESS") &&
            !finalResponseString.startsWith("REJECTED")
        ) {
            finalResponseString = `REJECTED: ${finalResponseString}`;
        }

        this.logger.log(
            `[${payload.userId}] Final Logistics Output: "${finalResponseString}"`,
        );

        // 7. Return the string straight back to the Orchestrator. No saving to DB!
        return finalResponseString;
    }
}
