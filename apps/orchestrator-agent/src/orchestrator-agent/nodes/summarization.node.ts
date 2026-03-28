import { OrchestratorStateType } from "../state";
import { SummarizerService } from "../../modules/summarizer/summarizer.service";

export const createSummarizationNode = (summarizer: SummarizerService) => {
    return async (state: OrchestratorStateType) => {
        console.log(
            `SummarizationNode: processing state for session ${state.session_id}`,
        );
        const messages = state.messages;
        if (messages.length <= 6) return {};

        try {
            const newSummary = await summarizer.summarize(
                messages.slice(0, -4),
                state.summary,
            );
            return {
                summary: newSummary,
                messages: messages.slice(-4),
            };
        } catch (e) {
            console.error("Summarization Node Error:", e);
            // Fallback: don't summarize this turn, just keep messages as is
            return {};
        }
    };
};
