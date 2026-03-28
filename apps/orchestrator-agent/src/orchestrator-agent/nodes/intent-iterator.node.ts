import { OrchestratorStateType } from "../state";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";
import { ChatOpenAI } from "@langchain/openai";

export interface IntentIteratorDependencies {
    knowledgeClient: KnowledgeClientService;
    lightModel: ChatOpenAI;
}

/**
 * Node to process the intent queue and set the next category to handle.
 */
export const createIntentIteratorNode = (deps: IntentIteratorDependencies) => {
    return async (state: OrchestratorStateType) => {
        console.log(
            `IntentIteratorNode: processing state for session ${state.session_id}`,
        );
        // If we already have a current category, we should process it first.
        // Handlers will set current_category to null when they are finished,
        // allowing the iterator to pick the next intent from the queue.
        if (state.current_category) {
            return {};
        }

        // If the queue is empty, we're done with intents
        if (state.intent_queue.length === 0) {
            return {
                current_category: null,
            };
        }

        // Pick the next intent from the queue
        const nextIntentObj = state.intent_queue[0];
        const nextCategory = nextIntentObj.category;
        const intentCode = nextIntentObj.intent || "GENERAL_QUERY";

        const remainingQueue = state.intent_queue.slice(1);
        const nextIndex = state.current_intent_index + 1;

        return {
            current_category: nextCategory,
            current_intent: intentCode,
            current_intent_index: nextIndex,
            intent_queue: remainingQueue,
            layers: [
                {
                    name: "Intent Queue",
                    status: "completed",
                    data: `Next category: ${nextCategory} (Index: ${nextIndex}) | Intent: ${intentCode}`,
                },
            ],
        };
    };
};
