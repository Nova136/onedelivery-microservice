import { StateGraph, START, END, BaseCheckpointSaver, Send } from "@langchain/langgraph";
import { OrchestratorState, OrchestratorStateType } from "./state";
import { ChatOpenAI } from "@langchain/openai";
import { InputValidatorService } from "../modules/input-validator/input-validator.service";
import { SemanticRouterService } from "../modules/semantic-router/semantic-router.service";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";
import { KnowledgeClientService } from "../modules/clients/knowledge-client/knowledge-client.service";
import { OrderClientService } from "../modules/clients/order-client/order-client.service";
import { SummarizerService } from "../modules/summarizer/summarizer.service";
import { StructuredTool } from "@langchain/core/tools";
import * as nodes from "./nodes";

// Define Services Interface
export interface GraphServices {
  inputValidator: InputValidatorService;
  semanticRouter: SemanticRouterService;
  outputEvaluator: OutputEvaluatorService;
  orderService: OrderClientService;
  summarizer: SummarizerService;
  knowledgeClient: KnowledgeClientService;
  strongModel: ChatOpenAI;
  lightModel: ChatOpenAI;
  tools: StructuredTool[];
}

/**
 * Factory function to create the Orchestrator Graph with injected services and checkpointer
 */
export function createOrchestratorGraph(services: GraphServices, checkpointer: BaseCheckpointSaver) {
  /**
   * Router for Preprocessing
   */
  function routeAfterPreProcessing(state: OrchestratorStateType) {
    if (!state.is_input_valid) {
      return "post_processing";
    }
    return "routing";
  }

  /**
   * Router for Category Branching (Parallel Processing)
   */
  function routeByCategory(state: OrchestratorStateType) {
    // If we have a sticky category, route directly to it
    if (state.current_category && (state.current_category === "cancel_order" || state.current_category === "request_refund")) {
      return "sop_handler";
    }

    // Otherwise, use decomposed_intents to map to handlers
    if (!state.decomposed_intents || state.decomposed_intents.length === 0) {
      return "post_processing";
    }

    const sends = state.decomposed_intents.map((intentObj, index) => {
      const category = intentObj.category;
      const intentCode = intentObj.intent || "GENERAL_QUERY";
      
      const payload = {
        ...state,
        current_category: category,
        current_intent: intentCode,
        current_intent_index: index,
      };

      if (category === "faq" || category === "general") {
        return new Send("informational_handler", payload);
      }
      if (category === "escalate") {
        return new Send("escalation", payload);
      }
      if (category === "end_session") {
        return new Send("end_session", payload);
      }
      return new Send("sop_handler", payload);
    });

    return sends;
  }

  // Build the graph
  const workflow = new StateGraph(OrchestratorState)
    .addNode("pre_processing", nodes.createPreProcessingNode({
      inputValidator: services.inputValidator,
      orderService: services.orderService
    }))
    .addNode("routing", nodes.createRoutingNode({
      semanticRouter: services.semanticRouter,
      lightModel: services.lightModel
    }))
    .addNode("informational_handler", nodes.createInformationalHandlerNode({
      lightModel: services.lightModel,
      tools: services.tools
    }))
    .addNode("end_session", nodes.createEndSessionNode(services.tools))
    .addNode("sop_handler", nodes.createSopHandlerNode({
      strongModel: services.strongModel,
      tools: services.tools,
      knowledgeClient: services.knowledgeClient
    }))
    .addNode("output_evaluation", nodes.createOutputEvaluationNode({
      outputEvaluator: services.outputEvaluator
    }))
    .addNode("self_correction", nodes.createSelfCorrectionNode({
      strongModel: services.strongModel
    }))
    .addNode("post_processing", nodes.createPostProcessingNode({
      summarizer: services.summarizer,
      lightModel: services.lightModel
    }))
    .addNode("escalation", nodes.createEscalationNode())
    .addEdge(START, "pre_processing")
    .addConditionalEdges("pre_processing", routeAfterPreProcessing, {
      routing: "routing",
      post_processing: "post_processing"
    })
    .addConditionalEdges("routing", routeByCategory, [
      "informational_handler",
      "sop_handler",
      "escalation",
      "end_session",
      "post_processing"
    ])
    .addEdge("informational_handler", "post_processing")
    .addEdge("end_session", "post_processing")
    .addEdge("sop_handler", "post_processing")
    .addEdge("escalation", "post_processing")
    .addEdge("post_processing", "output_evaluation")
    .addConditionalEdges("output_evaluation", (state: OrchestratorStateType) => {
      if (state.last_evaluation && !state.last_evaluation.isSafe && state.retry_count < 2) {
        return "self_correction";
      }
      return "end";
    }, {
      self_correction: "self_correction",
      end: END
    })
    .addEdge("self_correction", "output_evaluation");

  return workflow.compile({
    checkpointer,
  });
}
