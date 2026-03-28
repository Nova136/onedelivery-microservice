import { ChatOpenAI } from "@langchain/openai";
import { Logger, Injectable } from "@nestjs/common";
import { SEMANTIC_ROUTER_PROMPT } from "./prompts/semantic-router.prompt";
import { getSlidingWindowMessages } from "../../orchestrator-agent/utils/message-window";
import { formatOrders } from "../../orchestrator-agent/utils/format-orders";

@Injectable()
export class SemanticRouterService {
    private readonly logger = new Logger(SemanticRouterService.name);
    private model: ChatOpenAI;

    constructor() {
        this.model = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            openAIApiKey: process.env.OPENAI_API_KEY,
            temperature: 0,
            metadata: {
                environment: "production",
                component: "semantic-router",
            },
            tags: ["production", "routing"],
        });
    }

    async classifyCategory(
        messages: any[],
        summary: string,
        userOrders: any[] = [],
    ): Promise<{
        categories: string[];
        decomposed: Array<{ category: string; intent: string; query: string }>;
    }> {
        this.logger.log("Classifying user intent category...");
        // Use sliding window to ensure we have full turns for context
        const contextMessages = getSlidingWindowMessages(messages, 2);

        const userOrdersContext =
            userOrders.length > 0
                ? `<user_orders>\n${formatOrders(userOrders)}\n</user_orders>`
                : "No recent orders found.";

        const summaryContext = summary
            ? `<summary>\n${summary}\n</summary>`
            : "No previous conversation summary.";

        const prompt = SEMANTIC_ROUTER_PROMPT.replace(
            "{{summary}}",
            summaryContext,
        ).replace("{{user_orders}}", userOrdersContext);

        const response = await this.model.invoke([
            {
                role: "system",
                content: prompt,
            },
            {
                role: "user",
                content: `Conversation History:\n${contextMessages.map((m) => `${m.constructor.name === "HumanMessage" ? "user" : "assistant"}: ${m.content}`).join("\n")}`,
            },
        ]);

        const content = response.content.toString().trim();
        this.logger.debug(`Router Classification Result: ${content}`);

        try {
            const decomposed: Array<{
                category: string;
                intent: string;
                query: string;
            }> = JSON.parse(content);
            const validCategories = [
                "cancel_order",
                "request_refund",
                "faq",
                "general",
                "escalate",
                "end_session",
            ];
            const categories = Array.from(
                new Set(
                    decomposed
                        .map((d) => d.category)
                        .filter((cat) => validCategories.includes(cat)),
                ),
            );

            if (categories.length === 0) {
                this.logger.warn(
                    "No valid category identified, defaulting to 'general'",
                );
                return {
                    categories: ["general"],
                    decomposed: [
                        {
                            category: "general",
                            intent: "GENERAL_QUERY",
                            query: messages[messages.length - 1].content,
                        },
                    ],
                };
            }

            this.logger.log(`Identified Categories: ${categories.join(", ")}`);
            return { categories, decomposed };
        } catch (e) {
            this.logger.error(
                `Failed to parse router output as JSON: ${content}`,
            );
            // Fallback to simple parsing if JSON fails
            const validCategories = [
                "cancel_order",
                "request_refund",
                "faq",
                "general",
                "escalate",
                "end_session",
            ];
            const categories = validCategories.filter((cat) =>
                content.toLowerCase().includes(cat),
            );
            const finalCategories =
                categories.length > 0 ? categories : ["general"];
            return {
                categories: finalCategories,
                decomposed: finalCategories.map((cat) => ({
                    category: cat,
                    intent: "GENERAL_QUERY",
                    query: messages[messages.length - 1].content,
                })),
            };
        }
    }
}
