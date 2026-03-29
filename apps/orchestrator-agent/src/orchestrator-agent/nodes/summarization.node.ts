import { Logger } from "@nestjs/common";
import { SummarizerService } from "../../modules/summarizer/summarizer.service";
import { OrchestratorStateType } from "../state";

export interface SummarizationDependencies {
    summarizer: SummarizerService;
}

const logger = new Logger("SummarizationNode");

export const createSummarizationNode = (deps: SummarizationDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Summarizing session ${state.session_id}`);
        const { summarizer } = deps;

        let updatedMessages = [...state.messages];
        let newSummary = state.summary;

        if (updatedMessages.length > 6) {
            try {
                newSummary = await summarizer.summarize(
                    updatedMessages.slice(0, -4),
                    state.summary,
                );
                updatedMessages = updatedMessages.slice(-4);
            } catch (e) {
                logger.error("Summarization Error:", e);
            }
        }

        return {
            messages: updatedMessages,
            summary: newSummary,
        };
    };
};
