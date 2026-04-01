import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage } from "@langchain/core/messages";
import { Injectable } from "@nestjs/common";

@Injectable()
export class SummarizerService {
    private readonly model: BaseChatModel;

    constructor() {
        const primaryModel = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            openAIApiKey: process.env.OPENAI_API_KEY,
            temperature: 0,
            metadata: { environment: "production", component: "summarizer" },
            tags: ["production", "guardrail"],
        });

        const geminiFallback = new ChatGoogleGenerativeAI({
            model: "gemini-3-flash-preview",
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0,
        });

        this.model = primaryModel.withFallbacks({
            fallbacks: [geminiFallback],
        }) as unknown as BaseChatModel;
    }

    /**
     * Summarizes the conversation history.
     * @param messages The list of messages to summarize.
     * @param existingSummary The current summary to update.
     * @param currentTask The current active task (intent).
     * @returns The updated summary.
     */
    async summarize(
        messages: BaseMessage[],
        existingSummary: string = "",
        currentTask: string = "None",
    ): Promise<string> {
        if (messages.length === 0 && existingSummary) {
            // Even if no new messages, we might need to update the summary based on task status
            // But usually we call this when there are messages.
        }

        // Re-constructing the system prompt more cleanly
        const cleanSystemPrompt = `
<role>Conversation Summarizer.</role>
<task>Update the existing summary with new messages concisely.</task>

<instructions>
1. **Structure**: Include Current Goal, Key Facts (Order IDs, dates, items), Agent History, Status & Resolutions, Pending Actions, and User Sentiment.
2. **Task Transition**: 
   - If the "Current Active Task" is 'None' or different from what's in the 'Current Goal', move the previous goal to 'Status & Resolutions'.
   - **CRITICAL**: Determine the outcome (e.g., "Submitted", "Cancelled", "Resolved") based STRICTLY on the conversation history. 
   - If the agent says the request is "submitted" or "processing", the outcome is "Submitted" and it should also be listed in 'Pending Actions'.
   - Only use "Cancelled" or "Resolved" if the agent explicitly confirms the action is FINAL and complete.
   - Clear the 'Current Goal' if no task is active, or update it to the new 'Current Active Task'.
3. **Style**: Be concise, information-dense, and remove redundancies. Target length: ~200 words. If the conversation is very long, prioritize the most recent status and critical facts (Order IDs, resolutions).
4. **Output**: Return ONLY the updated summary text.
</instructions>
`;

        const userData = `
<existing_summary>
${existingSummary || "No existing summary."}
</existing_summary>

<context>
Current Active Task: ${currentTask}
</context>
`.trim();

        const response = await this.model.invoke(
            [
                { role: "system", content: cleanSystemPrompt },
                { role: "user", content: userData },
                ...messages,
            ],
            {
                runName: "Summarizer",
            },
        );

        return response.content as string;
    }
}
