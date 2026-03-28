import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";

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
                // 1. Fetch the raw JSON object from the pure API
                const sop = await knowledgeClient.searchInternalSop({
                    intentCode,
                    requestingAgent: "orchestrator",
                });

                // 2. Safe fallback if the LLM hallucinates a weird intent code
                if (!sop) {
                    return `Error: No internal rules found for intent '${intentCode}'. Please ask the user to clarify their request. DO NOT invent rules.`;
                }

                // 3. Format the JSON structure into a strict string for the LLM to read
                const formattedSop = `
### INTERNAL RULEBOOK: ${sop.title} ###

REQUIRED DATA TO COLLECT FIRST:
${sop.requiredData && sop.requiredData.length > 0 ? sop.requiredData.map((item: string) => `- ${item}`).join("\n") : "None. You may proceed."}

WORKFLOW STEPS (FOLLOW EXACTLY):
${sop.workflowSteps ? sop.workflowSteps.join("\n") : "None."}

PERMITTED TOOLS:
${sop.permittedTools && sop.permittedTools.length > 0 ? sop.permittedTools.join(", ") : "None."}
                `.trim();

                return formattedSop;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                // 4. Give the LLM instructions on how to handle the crash gracefully
                return `System Error: Knowledge Microservice unreachable. ${msg}. STRICT RULE: Tell the user you are experiencing technical difficulties and ask if they need a human agent.`;
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
