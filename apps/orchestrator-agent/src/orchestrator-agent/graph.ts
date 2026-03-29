import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StructuredTool } from "@langchain/core/tools";
import { StateGraph, START, END, BaseCheckpointSaver, Send } from "@langchain/langgraph";
import { AgentsClientService } from "../modules/clients/agents-client/agents-client.service";
import { KnowledgeClientService } from "../modules/clients/knowledge-client/knowledge-client.service";
import { MemoryClientService } from "../modules/clients/memory-client/memory-client.service";
import { OrderClientService } from "../modules/clients/order-client/order-client.service";
import { InputValidatorService } from "../modules/input-validator/input-validator.service";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";
import { SemanticRouterService } from "../modules/semantic-router/semantic-router.service";
import { SummarizerService } from "../modules/summarizer/summarizer.service";
import * as nodes from "./nodes";
import { OrchestratorState, OrchestratorStateType } from "./state";

// Define Services Interface
export interface GraphServices {
  inputValidator: InputValidatorService;
  semanticRouter: SemanticRouterService;
  outputEvaluator: OutputEvaluatorService;
  orderService: OrderClientService;
  summarizer: SummarizerService;
  knowledgeClient: KnowledgeClientService;
  sopModel: BaseChatModel;
  infoModel: BaseChatModel;
  routingModel: BaseChatModel;
  correctionModel: BaseChatModel;
  aggregationModel: BaseChatModel;
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
   * Router for Intent Branching (Parallel Processing)
   */
  async function routeByIntent(state: OrchestratorStateType) {
    const sops = await services.knowledgeClient.listOrchestratorSops();
    const sopIntents = sops.map(s => s.intentCode);

    // If we have a sticky intent, route directly to it
    if (state.current_intent && sopIntents.includes(state.current_intent)) {
      return "sop_handler";
    }

    // Otherwise, use decomposed_intents to map to handlers
    if (!state.decomposed_intents || state.decomposed_intents.length === 0) {
      return "post_processing";
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
    .addNode("pre_processing", nodes.createPreProcessingNode({
      inputValidator: services.inputValidator,
      orderService: services.orderService
    }))
    .addNode("routing", nodes.createRoutingNode({
      semanticRouter: services.semanticRouter,
      lightModel: services.routingModel,
      knowledgeClient: services.knowledgeClient
    }))
    .addNode("informational_handler", nodes.createInformationalHandlerNode({
      lightModel: services.infoModel,
      tools: services.tools
    }))
    .addNode("end_session", nodes.createEndSessionNode(services.tools))
    .addNode("reset_handler", nodes.createResetHandlerNode())
    .addNode("sop_handler", nodes.createSopHandlerNode({
      strongModel: services.sopModel,
      tools: services.tools,
      knowledgeClient: services.knowledgeClient
    }))
    .addNode("output_evaluation", nodes.createOutputEvaluationNode({
      outputEvaluator: services.outputEvaluator
    }))
    .addNode("self_correction", nodes.createSelfCorrectionNode({
      strongModel: services.correctionModel,
    }))
    .addNode("post_processing", nodes.createPostProcessingNode({
      summarizer: services.summarizer,
      lightModel: services.aggregationModel,
    }))
    .addNode("escalation", nodes.createEscalationNode())
    .addEdge(START, "pre_processing")
    .addConditionalEdges("pre_processing", routeAfterPreProcessing, {
      routing: "routing",
      post_processing: "post_processing"
    })
    .addConditionalEdges("routing", routeByIntent, [
      "informational_handler",
      "sop_handler",
      "escalation",
      "end_session",
      "reset_handler",
      "post_processing"
    ])
    .addEdge("informational_handler", "post_processing")
    .addEdge("end_session", "post_processing")
    .addEdge("reset_handler", "post_processing")
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
