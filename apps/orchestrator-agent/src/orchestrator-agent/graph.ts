import {
    StateGraph,
    START,
    END,
    BaseCheckpointSaver,
} from "@langchain/langgraph";
import { OrchestratorState, OrchestratorStateType } from "./state";
import { ChatOpenAI } from "@langchain/openai";
import { PiiRedactionService } from "../modules/pii-redaction/pii-redaction.service";
import { InputValidatorService } from "../modules/input-validator/input-validator.service";
import { SemanticRouterService } from "../modules/semantic-router/semantic-router.service";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";
import { KnowledgeClientService } from "../modules/clients/knowledge-client/knowledge-client.service";
import { AgentsClientService } from "../modules/clients/agents-client/agents-client.service";
import { OrderClientService } from "../modules/clients/order-client/order-client.service";
import { SummarizerService } from "../modules/summarizer/summarizer.service";
import { StructuredTool } from "@langchain/core/tools";
import * as nodes from "./nodes";

// Define Services Interface
export interface GraphServices {
    piiService: PiiRedactionService;
    inputValidator: InputValidatorService;
    semanticRouter: SemanticRouterService;
    outputEvaluator: OutputEvaluatorService;
    orderService: OrderClientService;
    summarizer: SummarizerService;
    knowledgeClient: KnowledgeClientService;
    agentsClient: AgentsClientService;
    strongModel: ChatOpenAI;
    lightModel: ChatOpenAI;
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
     * Router for Output Validation
     */
    function routeAfterValidation(state: OrchestratorStateType) {
        const evaluation = state.last_evaluation;
        if (!evaluation?.isSafe) {
            if (state.retry_count < 2) {
                return "self_correction";
            }
            return "escalation";
        }
        return "summarization";
    }

    /**
     * Router for Preprocessing
     */
    function routeAfterPreprocessing(state: OrchestratorStateType) {
        if (!state.is_input_valid) {
            return "summarization";
        }
        return "routing";
    }

    /**
     * Router for Category Branching
     */
    function routeByCategory(state: OrchestratorStateType) {
        const category = state.current_category;
        if (!category) return "aggregator";
        if (category === "faq") return "faq_handler";
        if (category === "escalate") return "escalation";
        if (category === "end_session") return "end_session";
        if (category === "resolution" || category === "logistics")
            return "sop_retrieval";
        if (category === "general") return "general_handler";
        return "dialogue"; // Default to SOP-based dialogue
    }

    // Build the graph
    const workflow = new StateGraph(OrchestratorState)
        .addNode(
            "preprocessing",
            nodes.createPreprocessingNode({
                piiService: services.piiService,
                inputValidator: services.inputValidator,
                orderService: services.orderService,
            }),
        )
        .addNode(
            "routing",
            nodes.createRoutingNode({
                semanticRouter: services.semanticRouter,
                knowledgeClient: services.knowledgeClient,
                lightModel: services.lightModel,
            }),
        )
        .addNode(
            "faq_handler",
            nodes.createFaqHandlerNode({
                lightModel: services.lightModel,
                tools: services.tools,
            }),
        )
        .addNode(
            "general_handler",
            nodes.createGeneralHandlerNode({
                lightModel: services.lightModel,
                tools: services.tools,
            }),
        )
        .addNode("end_session", nodes.createEndSessionNode(services.tools))
        .addNode(
            "sop_retrieval",
            nodes.createSopRetrievalNode(services.knowledgeClient),
        )
        .addNode(
            "dialogue",
            nodes.createDialogueNode({
                strongModel: services.strongModel,
                lightModel: services.lightModel,
                tools: services.tools,
            }),
        )
        .addNode(
            "output_validation",
            nodes.createOutputValidationNode(services.outputEvaluator),
        )
        .addNode(
            "self_correction",
            nodes.createSelfCorrectionNode(services.strongModel),
        )
        .addNode("escalation", nodes.createEscalationNode())
        .addNode(
            "summarization",
            nodes.createSummarizationNode(services.summarizer),
        )
        .addNode(
            "intent_iterator",
            nodes.createIntentIteratorNode({
                knowledgeClient: services.knowledgeClient,
                lightModel: services.lightModel,
            }),
        )
        .addNode(
            "aggregator",
            nodes.createAggregatorNode({ lightModel: services.lightModel }),
        )
        .addEdge(START, "preprocessing")
        .addConditionalEdges("preprocessing", routeAfterPreprocessing, {
            routing: "routing",
            summarization: "summarization",
        })
        .addEdge("routing", "intent_iterator")
        .addConditionalEdges("intent_iterator", routeByCategory, {
            faq_handler: "faq_handler",
            general_handler: "general_handler",
            sop_retrieval: "sop_retrieval",
            dialogue: "dialogue",
            escalation: "escalation",
            end_session: "end_session",
            aggregator: "aggregator",
        })
        .addEdge("sop_retrieval", "dialogue")
        .addEdge("faq_handler", "intent_iterator")
        .addEdge("general_handler", "intent_iterator")
        .addEdge("end_session", "intent_iterator")
        .addEdge("dialogue", "intent_iterator")
        .addEdge("aggregator", "output_validation")
        .addConditionalEdges("output_validation", routeAfterValidation, {
            self_correction: "self_correction",
            escalation: "escalation",
            summarization: "summarization",
        })
        .addEdge("self_correction", "output_validation")
        .addEdge("escalation", "summarization")
        .addEdge("summarization", END);

    return workflow.compile({
        checkpointer,
    });
}
