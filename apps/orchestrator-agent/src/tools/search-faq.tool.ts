import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { KnowledgeService } from "@apps/knowledge/src/knowledge.service";
import { KnowledgeClientService } from "../agents/knowledge-client.service";

const answerUserQuestionSchema = z
    .string()
    .describe(
        "The user's specific question summarized into a search query (e.g., 'What are the delivery hours?').",
    );

export function createSearchFaqTool(
    knowledgeClient: KnowledgeClientService,
): StructuredTool {
    return tool(
        async (query: string) => {
            try {
                const reply = await knowledgeClient.searchFaq({
                    query: query,
                });
                return reply;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Knowledge Microservice unreachable. ${msg}`;
            }
        },
        {
            name: "Search_FAQ",
            description:
                "Use this tool to answer general customer questions about public information (e.g., store hours, general delivery areas, app usage). DO NOT use this for specific order issues or complaints.",
            schema: answerUserQuestionSchema,
        },
    );
}
