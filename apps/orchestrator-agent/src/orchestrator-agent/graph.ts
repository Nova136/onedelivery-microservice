import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StructuredTool } from "@langchain/core/tools";
import {
    StateGraph,
    START,
    END,
    BaseCheckpointSaver,
    Send,
} from "@langchain/langgraph";
import { KnowledgeClientService } from "../modules/clients/knowledge-client/knowledge-client.service";
import { OrderClientService } from "../modules/clients/order-client/order-client.service";
import { InputValidatorService } from "../modules/input-validator/input-validator.service";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";
import { SemanticRouterService } from "../modules/semantic-router/semantic-router.service";
import { SummarizerService } from "../modules/summarizer/summarizer.service";
import { PromptShieldService } from "../modules/prompt-shield/prompt-shield.service";
import * as nodes from "./nodes";
import { OrchestratorState, OrchestratorStateType } from "./state";

// Define Services Interface
export interface GraphServices {
    semanticRouter: SemanticRouterService;
    outputEvaluator: OutputEvaluatorService;
    orderService: OrderClientService;
    summarizer: SummarizerService;
    knowledgeClient: KnowledgeClientService;
    promptShield: PromptShieldService;
    sopModel: BaseChatModel;
    sopModelFallback: BaseChatModel;
    infoModel: BaseChatModel;
    infoModelFallback: BaseChatModel;
    routingModel: BaseChatModel;
    routingModelFallback: BaseChatModel;
    correctionModel: BaseChatModel;
    correctionModelFallback: BaseChatModel;
    aggregationModel: BaseChatModel;
    aggregationModelFallback: BaseChatModel;
    tools: StructuredTool[];
}

/**
 * Factory function to create the Orchestrator Graph with injected services and checkpointer
 */
export function createOrchestratorGraph(
    services: GraphServices,
    checkpointer: BaseCheckpointSaver,
) {
    /**
     * Router for Preprocessing
     */
    function routeAfterPreProcessing(state: OrchestratorStateType) {
        if (!state.is_input_valid) {
            return "summarization";
        }
        return "routing";
    }

    /**
     * Router for Intent Branching (Parallel Processing)
     */
    async function routeByIntent(state: OrchestratorStateType) {
        const sops = await services.knowledgeClient.listOrchestratorSops();
        const sopIntents = sops.map((s) => s.intentCode);

        // If we have a sticky intent, route directly to it
        if (state.current_intent && sopIntents.includes(state.current_intent)) {
            return "sop_handler";
        }

        // Otherwise, use decomposed_intents to map to handlers
        if (
            !state.decomposed_intents ||
            state.decomposed_intents.length === 0
        ) {
            return "summarization";
        }

        const sends = state.decomposed_intents.map((intentObj, index) => {
            const intentCode = intentObj.intent || "general";

            const payload = {
                ...state,
                current_intent: intentCode,
                current_intent_index: index,
            };

            if (intentCode === "faq" || intentCode === "general") {
                return new Send("informational_handler", payload);
            }
            if (intentCode === "escalate") {
                return new Send("escalation", payload);
            }
            if (intentCode === "end_session") {
                return new Send("end_session", payload);
            }
            if (intentCode === "reset") {
                return new Send("reset_handler", payload);
            }
            return new Send("sop_handler", payload);
        });

        return sends;
    }

    // Build the graph
    const workflow = new StateGraph(OrchestratorState)
        .addNode(
            "pre_processing",
            nodes.createPreProcessingNode({
                orderService: services.orderService,
            }),
        )
        .addNode(
            "routing",
            nodes.createRoutingNode({
                semanticRouter: services.semanticRouter,
                llm: services.routingModel,
                llmFallback: services.routingModelFallback,
                knowledgeClient: services.knowledgeClient,
            }),
        )
        .addNode(
            "informational_handler",
            nodes.createInformationalHandlerNode({
                llm: services.infoModel,
                llmFallback: services.infoModelFallback,
                tools: services.tools,
                promptShield: services.promptShield,
            }),
        )
        .addNode("end_session", nodes.createEndSessionNode(services.tools))
        .addNode("reset_handler", nodes.createResetHandlerNode())
        .addNode(
            "sop_handler",
            nodes.createSopHandlerNode({
                llm: services.sopModel,
                llmFallback: services.sopModelFallback,
                tools: services.tools,
                knowledgeClient: services.knowledgeClient,
                promptShield: services.promptShield,
            }),
        )
        .addNode(
            "aggregation",
            nodes.createAggregationNode({
                llm: services.aggregationModel,
                llmFallback: services.aggregationModelFallback,
            }),
        )
        .addNode(
            "output_evaluation",
            nodes.createOutputEvaluationNode({
                outputEvaluator: services.outputEvaluator,
                promptShield: services.promptShield,
            }),
        )
        .addNode(
            "self_correction",
            nodes.createSelfCorrectionNode({
                llm: services.correctionModel,
                llmFallback: services.correctionModelFallback,
            }),
        )
        .addNode(
            "summarization",
            nodes.createSummarizationNode({
                summarizer: services.summarizer,
            }),
        )
        .addNode("escalation", nodes.createEscalationNode())
        .addEdge(START, "pre_processing")
        .addConditionalEdges("pre_processing", routeAfterPreProcessing, {
            routing: "routing",
            summarization: "summarization",
        })
        .addConditionalEdges("routing", routeByIntent, [
            "informational_handler",
            "sop_handler",
            "escalation",
            "end_session",
            "reset_handler",
        ])
        .addEdge("informational_handler", "aggregation")
        .addEdge("end_session", "aggregation")
        .addEdge("reset_handler", "aggregation")
        .addEdge("sop_handler", "aggregation")
        .addEdge("escalation", "aggregation")
        .addEdge("aggregation", "output_evaluation")
        .addConditionalEdges(
            "output_evaluation",
            (state: OrchestratorStateType) => {
                if (
                    state.last_evaluation &&
                    !state.last_evaluation.isSafe &&
                    state.retry_count < 2
                ) {
                    return "self_correction";
                }
                return "summarization";
            },
            {
                self_correction: "self_correction",
                summarization: "summarization",
            },
        )
        .addEdge("self_correction", "output_evaluation")
        .addEdge("summarization", END);

    return workflow.compile({
        checkpointer,
    });
}
