import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage } from "@langchain/core/messages";
import { Injectable } from "@nestjs/common";

const SUMMARIZER_PROMPT = `
<role>Conversation Summarizer.</role>
<task>Update the existing summary with new messages concisely.</task>

<existing_summary>
{{existing_summary}}
</existing_summary>

<instructions>
1. **Structure**: Include Current Goal, Key Facts (Order IDs, dates, items), Agent History, Status & Resolutions, Pending Actions, and User Sentiment.
2. **Style**: Be concise, information-dense, and remove redundancies.
3. **Output**: Return ONLY the updated summary text.
</instructions>
`;

@Injectable()
export class SummarizerService {
    private readonly model: BaseChatModel;

    constructor() {
        const primaryModel = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            openAIApiKey: process.env.OPENAI_API_KEY,
            temperature: 0,
            metadata: { environment: "production", component: "summarizer" },
            tags: ["production", "guardrail"]
        });

        const geminiFallback = new ChatGoogleGenerativeAI({
            model: "gemini-3-flash-preview",
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0,
        });

        this.model = primaryModel.withFallbacks({ fallbacks: [geminiFallback] }) as unknown as BaseChatModel;
    }

    /**
     * Summarizes the conversation history.
     * @param messages The list of messages to summarize.
     * @param existingSummary The current summary to update.
     * @returns The updated summary.
     */
    async summarize(messages: BaseMessage[], existingSummary: string = ""): Promise<string> {
        if (messages.length === 0) return existingSummary;

        // Split prompt into system instructions and user data to avoid role confusion
        const systemPrompt = SUMMARIZER_PROMPT.split("<existing_summary>")[0].trim() + "\n\n" + SUMMARIZER_PROMPT.split("</existing_summary>")[1].trim();
        const userData = `<existing_summary>${SUMMARIZER_PROMPT.split("<existing_summary>")[1].split("</existing_summary>")[0]}</existing_summary>`
            .replace("{{existing_summary}}", existingSummary || "No existing summary.").trim();

        const response = await this.model.invoke([
            { role: "system", content: systemPrompt },
            { role: "user", content: userData },
            ...messages
        ]);

        return response.content as string;
    }
}
