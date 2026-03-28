import { OrchestratorStateType } from "../state";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";

export const createSopRetrievalNode = (
    knowledgeClient: KnowledgeClientService,
) => {
    return async (state: OrchestratorStateType) => {
        console.log(
            `SopRetrievalNode: processing state for session ${state.session_id}`,
        );
        const intent = state.current_intent;
        if (!intent || intent === "GENERAL_QUERY") {
            return {
                current_sop: null,
                layers: [
                    {
                        name: "SOP Retrieval",
                        status: "completed",
                        data: "No specific SOP needed",
                    },
                ],
            };
        }

        const sop = await knowledgeClient.searchInternalSop({
            intentCode: intent,
            requestingAgent: "orchestrator",
        });

        return {
            current_sop: sop || null,
            layers: [
                {
                    name: "SOP Retrieval",
                    status: "completed",
                    data: sop ? `SOP: ${sop.title}` : "SOP not found",
                },
            ],
        };
    };
};
