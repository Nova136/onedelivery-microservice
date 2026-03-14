import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { KnowledgeClientService } from "../agents/knowledge-client.service";

const fetchInternalSOPSchema = z
    .string()
    .describe(
        "A short summary of the user's situation to search the manual for (e.g., 'customer wants to cancel unassigned order' or 'driver dropped food').",
    );

export function createSearchInternalSopTool(
    knowledgeClient: KnowledgeClientService,
): StructuredTool {
    return tool(
        async (query: string) => {
            try {
                const reply = await knowledgeClient.searchInternalSop({
                    query: query,
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
                "CRITICAL: ALWAYS use this tool FIRST when a user has a specific problem requiring an action (like cancelling an order, reporting missing food, or requesting a refund) to learn the exact internal rules you must follow.",
            schema: fetchInternalSOPSchema,
        },
    );
}
