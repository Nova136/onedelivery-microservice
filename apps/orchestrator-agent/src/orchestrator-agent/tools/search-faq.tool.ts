import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";

const answerUserQuestionSchema = z.object({
    query: z
        .string()
        .describe(
            "The user's specific question summarized into a search query (e.g., 'What are the delivery hours?').",
        ),
});

export function createSearchFaqTool(
    knowledgeClient: KnowledgeClientService,
): StructuredTool {
    return tool(
        async ({ query }: { query: string }) => {
            try {
                // 1. Fetch the raw data from your pure API
                const rawFaqContent = await knowledgeClient.searchFaq({
                    query,
                });

                // 2. Handle the empty state inside the tool
                if (!rawFaqContent || rawFaqContent.length === 0) {
                    return "No relevant FAQ found. STRICT RULE: DO NOT guess or make up an answer. Reply EXACTLY with: 'I'm sorry, I don't have the answer to that specific question.'";
                }

                const formattedFaqs = rawFaqContent
                    .map(
                        (faq, index) =>
                            `[FAQ ${index + 1}]\nQuestion: ${faq.title}\nAnswer: ${faq.content}`,
                    )
                    .join("\n\n");

                // 4. Wrap the formatted data with your strict LLM instructions
                return `### SEARCH RESULTS ###\n${formattedFaqs}`.trim();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`System Error: Knowledge Microservice unreachable. ${msg}`);
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
