import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StructuredTool } from "@langchain/core/tools";
import {
    ToolMessage,
    BaseMessage,
    SystemMessage,
} from "@langchain/core/messages";
import { AgentsClientService } from "./agents/agents-client.service";
import { KnowledgeClientService } from "./agents/knowledge-client.service";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";
import { createGetOrderDetailsTool } from "./tools/get-order-details.tool";
import { createExecuteRefundTool } from "./tools/execute-refund.tool";
import { createRouteToGuardianTool } from "./tools/route-to-guardian.tool";
import { resolutionPromptBase } from "./core/prompt/resolution.prompt";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";

/** Refunds above this USD amount are rejected without Guardian or Execute_Refund. */
const AUTO_APPROVAL_LIMIT_USD = 20;

@Injectable()
export class ResolutionService {
    private readonly logger = new Logger(ResolutionService.name);
    private llm: ChatOpenAI;
    private agentWithTools: any;
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

        this.llm = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0,
        });

        this.agentWithTools = this.llm.bindTools(Object.values(this.tools));
    }

    async processRefund(payload: AgentChatPayload): Promise<string> {
        const { userId, sessionId, message } = payload;
        this.logger.log(`[${userId}] Starting refund process...`);

        let sopContext = "No SOP found.";
        try {
            const rawSop = await this.knowledgeClient.searchInternalSop({
                intentCode: "PROCESS_REFUND_LOGIC",
                requestingAgent: "refund_agent",
            });
            if (rawSop?.workflowSteps?.length) {
                sopContext = `
WORKFLOW STEPS (FOLLOW EXACTLY):
${rawSop.workflowSteps.join("\n")}
                `.trim();
            }
        } catch (error) {
            this.logger.error("Failed to fetch SOP", error);
            return "REJECTED: Internal database error while fetching Resolution rules.";
        }

        const preflightReject = await this.maybeRejectPreflight(message);
        if (preflightReject) {
            this.logger.log(
                `[${userId}] Preflight reject — returning without agent loop.`,
            );
            return preflightReject;
        }

        const basePrompt = resolutionPromptBase
            .replace("{userId}", userId)
            .replace("{sessionId}", sessionId);

        const systemPrompt = `
${basePrompt}

### YOUR SOP ###
${sopContext}

### HIDDEN REASONING ###
Before you use a tool or return your final answer, you MUST enclose your internal reasoning inside <thinking> tags.
        `.trim();

        const prompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(systemPrompt),
            ["human", "Process this refund request. Payload: {input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        let finalMessage: BaseMessage | undefined;
        const scratchpad: BaseMessage[] = [];

        for (let i = 0; i < 5; i++) {
            this.logger.log(`[${userId}] Resolution Loop ${i + 1}: Thinking...`);

            const formattedPrompt = await prompt.formatMessages({
                input: message,
                agent_scratchpad: scratchpad,
            });

            const response = await this.agentWithTools.invoke(formattedPrompt);

            if (response.content && String(response.content).length > 0) {
                this.logger.log(`[${userId}] Resolution Thought: ${response.content}`);
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

        let result =
            (finalMessage?.content as string) ||
            "REJECTED: Agent failed to reach a conclusion.";

        result = result
            .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
            .trim();

        this.logger.log(`[${userId}] Final Result (pre-guardian): "${result}"`);

        if (this.shouldSkipResolutionGuardianVerification(result)) {
            return result;
        }

        const verificationMessage = `Verify this resolution response against SOP before it is returned to the system. Original request: "${message}". Proposed resolution: "${result}". Confirm it is accurate and follows policy.`;
        const guardianVerified = await this.agentsClient.send(
            "guardian",
            AGENT_CHAT_PATTERN,
            {
                userId,
                sessionId: `${sessionId}-verify`,
                message: verificationMessage,
            },
        );
        const guardianReply = guardianVerified?.reply || "";
        const finalResult = guardianReply.startsWith("CORRECTED: ")
            ? guardianReply
                  .replace("CORRECTED: ", "")
                  .replace(/\[.*?\]$/, "")
                  .trim()
            : result;
        this.logger.log(`[${userId}] Guardian Verified Result: "${finalResult}"`);
        return finalResult;
    }

    /**
     * Single order fetch: reject if refundStatus is not NONE, or (missing/wrong items) if amount > $20.
     */
    private async maybeRejectPreflight(message: string): Promise<string | null> {
        type Payload = {
            orderId?: string;
            issueCategory?: string;
            items?: { name: string; quantity: number }[];
        };
        let payload: Payload;
        try {
            payload = JSON.parse(message) as Payload;
        } catch {
            return null;
        }
        if (!payload.orderId) return null;

        const order = await this.agentsClient.send(
            "order",
            { cmd: "order.get" },
            { orderId: payload.orderId },
        );
        if (!order || order.found === false) return null;

        const refundStatus =
            (order as { refundStatus?: string }).refundStatus ?? "NONE";
        if (refundStatus !== "NONE") {
            return `REJECTED: Refunds can only be processed when order refundStatus is NONE. Current refundStatus: ${refundStatus}.`;
        }

        if (
            payload.issueCategory !== "missing_item" &&
            payload.issueCategory !== "wrong_item"
        ) {
            return null;
        }
        if (!payload.items?.length) return null;

        const orderItems = order.items as Array<{
            productName: string;
            price: string | number;
            quantityOrdered: number;
            quantityRefunded: number;
        }>;

        let totalCents = 0;
        for (const req of payload.items) {
            const line = this.findOrderLineForName(orderItems, req.name);
            if (!line) return null;
            const remaining = line.quantityOrdered - line.quantityRefunded;
            const qty = Math.min(Math.max(0, req.quantity), remaining);
            totalCents += Math.round(qty * Number(line.price) * 100);
        }

        if (totalCents > AUTO_APPROVAL_LIMIT_USD * 100) {
            return "REJECTED: Refund amount exceeds the $20 auto-approval limit; this request requires manual review.";
        }
        return null;
    }

    private normalizeProductName(name: string): string {
        return name.toLowerCase().replace(/^\d+\s+/, "").trim();
    }

    private findOrderLineForName(
        items: Array<{
            productName: string;
            price: string | number;
            quantityOrdered: number;
            quantityRefunded: number;
        }>,
        requestedName: string,
    ): (typeof items)[0] | undefined {
        const n = this.normalizeProductName(requestedName);
        return items.find((oi) => {
            const pn = oi.productName.toLowerCase();
            return pn === n || pn.includes(n) || n.includes(pn);
        });
    }

    /** Avoid Guardian "correcting" deterministic preflight rejections. */
    private shouldSkipResolutionGuardianVerification(result: string): boolean {
        if (!result.startsWith("REJECTED:")) return false;
        return (
            result.includes("auto-approval limit") ||
            result.includes("refundStatus is NONE")
        );
    }
}
