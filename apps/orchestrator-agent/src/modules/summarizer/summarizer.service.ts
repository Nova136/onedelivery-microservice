import { ChatOpenAI } from "@langchain/openai";
import {
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { Injectable } from "@nestjs/common";

const SUMMARIZER_PROMPT = `
<role>Conversation Summarizer.</role>

<existing_summary>
{{existing_summary}}
</existing_summary>

<instructions>
1. Update summary with new messages.
2. Structure:
   - Current Goal: User's objective.
   - Key Facts: Order IDs, dates, items.
   - Agent History: Involved agents and actions.
   - Status & Resolutions: Resolved items and current status.
   - Pending Actions: Next steps.
   - User Sentiment: Tone (e.g., frustrated, satisfied).
3. Be concise and information-dense. Remove redundant info.
4. Output ONLY the updated summary text.
</instructions>
`;

@Injectable()
export class SummarizerService {
    private readonly model: ChatOpenAI;

    constructor() {
        this.model = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0,
            metadata: { environment: "production", component: "summarizer" },
            tags: ["production", "memory"],
        });
    }

    /**
     * Summarizes the conversation history.
     * @param messages The list of messages to summarize.
     * @param existingSummary The current summary to update.
     * @returns The updated summary.
     */
    async summarize(
        messages: BaseMessage[],
        existingSummary: string = "",
    ): Promise<string> {
        if (messages.length === 0) return existingSummary;

        const summarizerPrompt = SUMMARIZER_PROMPT.replace(
            "{{existing_summary}}",
            existingSummary || "No existing summary.",
        );

        const response = await this.model.invoke([
            { role: "system", content: summarizerPrompt },
            ...messages,
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
