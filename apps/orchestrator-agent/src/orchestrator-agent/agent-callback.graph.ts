import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StateGraph, START, END } from "@langchain/langgraph";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";
import { PiiRedactionService } from "../modules/pii-redaction/pii-redaction.service";
import { PromptShieldService } from "../modules/prompt-shield/prompt-shield.service";
import { AuditService } from "../modules/audit/audit.service";
import * as nodes from "./nodes";
import { AgentCallbackState } from "./agent-callback.state";

export interface CallbackGraphServices {
    piiService: PiiRedactionService;
    promptShield: PromptShieldService;
    outputEvaluator: OutputEvaluatorService;
    auditService: AuditService;
    llm: BaseChatModel;
    llmFallback: BaseChatModel;
}

/**
 * Factory function to create the Agent Callback Graph
 */
export function createAgentCallbackGraph(services: CallbackGraphServices) {
    const workflow = new StateGraph(AgentCallbackState)
        .addNode(
            "pre_processing",
            nodes.createCallbackPreProcessingNode({
                piiService: services.piiService,
                promptShield: services.promptShield,
            }),
        )
        .addNode(
            "extraction",
            nodes.createCallbackExtractionNode({
                llm: services.llm,
                llmFallback: services.llmFallback,
                promptShield: services.promptShield,
            }),
        )
        .addNode(
            "evaluation",
            nodes.createCallbackEvaluationNode({
                outputEvaluator: services.outputEvaluator,
                auditService: services.auditService,
            }),
        )
        .addEdge(START, "pre_processing")
        .addEdge("pre_processing", "extraction")
        .addEdge("extraction", "evaluation")
        .addEdge("evaluation", END);

    return workflow.compile({
        name: "AgentCallbackGraph",
    });
}
