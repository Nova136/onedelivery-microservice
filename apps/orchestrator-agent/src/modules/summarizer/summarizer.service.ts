import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { Injectable, Optional } from "@nestjs/common";

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

        const summarizerPrompt = SUMMARIZER_PROMPT
            .replace("{{existing_summary}}", existingSummary || "No existing summary.");

        const response = await this.model.invoke([
            { role: "system", content: summarizerPrompt },
            ...messages
        ]);

        return response.content as string;
    }

    /**
     * Formats messages into a transcript string for summarization if needed.
     */
    private formatTranscript(messages: BaseMessage[]): string {
        return messages
            .map((msg) => {
                let role = "System";
                if (msg instanceof HumanMessage) role = "User";
                else if (msg instanceof AIMessage) role = "AI";
                else if (msg instanceof ToolMessage) role = "Tool";
                return `${role}: ${msg.content}`;
            })
            .join("\n");
    }
}
