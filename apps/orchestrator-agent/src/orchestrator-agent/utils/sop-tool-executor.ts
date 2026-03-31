import { StructuredTool } from "@langchain/core/tools";
import { SystemMessage } from "@langchain/core/messages";
import { Logger } from "@nestjs/common";
import { OrchestratorStateType } from "../state";
import { DIALOGUE_PROMPTS } from "../prompts/sop.prompt";

const logger = new Logger("SopToolExecutor");

export interface ToolExecutionResult {
    success: boolean;
    messages: any[];
    finalResponse?: string;
    updatedOrderStates?: any;
    is_awaiting_confirmation?: boolean;
    partial_responses?: string[];
}

export async function executeSopTool(
    tool: StructuredTool,
    agentOutput: any,
    state: OrchestratorStateType,
    intent: string,
    updatedOrderStates: any,
): Promise<ToolExecutionResult> {
    const messages: any[] = [];
    let finalResponse: string | undefined;

    try {
        logger.debug(`Executing tool: ${tool.name}`);
        let parsedArgs = {};
        try {
            parsedArgs = JSON.parse(agentOutput.requested_tool.args);
        } catch (e) {
            logger.error("Failed to parse tool args:", e);
        }

        // Confused Deputy Defense: Validate order ownership
        if (parsedArgs && (parsedArgs as any).orderId) {
            const orderId = (parsedArgs as any).orderId;
            const userOwnsOrder = state.user_orders.some(o => o.orderId === orderId);
            if (!userOwnsOrder) {
                logger.warn(`Confused Deputy Attack Prevented: User ${state.user_id} attempted to access unowned order ${orderId}`);
                return {
                    success: false,
                    messages: [],
                    partial_responses: ["I'm sorry, but I couldn't find that order in your account. Please provide a valid order ID."],
                    updatedOrderStates: { ...updatedOrderStates, orderId: null }, // clear the invalid order ID
                    is_awaiting_confirmation: false,
                };
            }
        }

        // Inject system fields from state
        const args: any = {
            ...parsedArgs,
            action: state.current_intent?.toLowerCase() || intent.toLowerCase(),
            userId: state.user_id,
            sessionId: state.session_id,
        };
        
        try {
            await tool.invoke(args);
            logger.log(`Completion tool ${tool.name} triggered.`);
            messages.push(new SystemMessage(`SYSTEM_ACTION: Tool ${tool.name} executed successfully with intent ${intent}.`));
            return { success: true, messages };
        } catch (toolError) {
            logger.error(`Tool execution error for ${tool.name}:`, toolError);
            finalResponse = DIALOGUE_PROMPTS.SYSTEM_FAULT_PROMPT;
            return { success: false, messages, finalResponse };
        }
    } catch (e) {
        logger.error(`Synchronous tool setup error for ${tool.name}:`, e);
        finalResponse = DIALOGUE_PROMPTS.SYSTEM_FAULT_PROMPT;
        return { success: false, messages, finalResponse };
    }
}
