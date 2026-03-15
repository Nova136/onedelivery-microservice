import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { KnowledgeClientService } from "../agents/knowledge-client.service";

const fetchInternalSOPSchema = z
    .object({
        intentCode: z
            .string()
            .describe(
                "The unique intent code for the user's request (e.g., 'REQUEST_REFUND', 'CANCEL_ORDER').",
            ),
    })
    .describe(
        "Input to search for an internal Standard Operating Procedure (SOP).",
    );

export function createSearchInternalSopTool(
    knowledgeClient: KnowledgeClientService,
): StructuredTool {
    return tool(
        async ({ intentCode }: { intentCode: string }) => {
            try {
                // The 'orchestrator' is hardcoded as it's the only agent using this tool
                const reply = await knowledgeClient.searchInternalSop({
                    intentCode,
                    requestingAgent: "orchestrator",
                });
                return reply;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Knowledge Microservice unreachable. ${msg}`;
            }
        },
        {
            name: "Search_Internal_SOP",
            description:
                "CRITICAL: ALWAYS use this tool FIRST when a user has a specific problem requiring an action (like cancelling an order, reporting missing food, or requesting a refund) to learn the exact internal rules you must follow. You must provide a specific intent code based on the user's request.",
            schema: fetchInternalSOPSchema,
        },
    );
}
