import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { Global, Module } from "@nestjs/common";
import { AgentsClientModule } from "../modules/clients/agents-client/agents-client.module";
import { AgentsClientService } from "../modules/clients/agents-client/agents-client.service";
import { KnowledgeClientModule } from "../modules/clients/knowledge-client/knowledge-client.module";
import { KnowledgeClientService } from "../modules/clients/knowledge-client/knowledge-client.service";
import { MemoryClientModule } from "../modules/clients/memory-client/memory-client.module";
import { MemoryClientService } from "../modules/clients/memory-client/memory-client.service";
import { OrderClientModule } from "../modules/clients/order-client/order-client.module";
import { OrderClientService } from "../modules/clients/order-client/order-client.service";
import { OutputEvaluatorModule } from "../modules/output-evaluator/output-evaluator.module";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";
import { PiiRedactionModule } from "../modules/pii-redaction/pii-redaction.module";
import { PiiRedactionService } from "../modules/pii-redaction/pii-redaction.service";
import { IntentClassifierModule } from "../modules/intent-classifier/intent-classifier.module";
import { IntentClassifierService } from "../modules/intent-classifier/intent-classifier.service";
import { SummarizerModule } from "../modules/summarizer/summarizer.module";
import { PromptShieldModule } from "../modules/prompt-shield/prompt-shield.module";
import { PromptShieldService } from "../modules/prompt-shield/prompt-shield.service";
import { AuditModule } from "../modules/audit/audit.module";
import { AuditService } from "../modules/audit/audit.service";
import pg from "pg";
import { createCheckpointer } from "./checkpointer";
import { createOrchestratorGraph } from "./graph";
import { createAgentCallbackGraph } from "./agent-callback.graph";
import { OrchestratorGateway } from "./orchestrator.gateway";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorService } from "./orchestrator.service";
import * as tools from "./tools";
import { SessionController } from "./session.controller";
import { InputValidatorModule } from "../modules/input-validator/input-validator.module";

@Global()
@Module({
    imports: [
        PiiRedactionModule,
        IntentClassifierModule,
        OutputEvaluatorModule,
        KnowledgeClientModule,
        OrderClientModule,
        AgentsClientModule,
        MemoryClientModule,
        SummarizerModule,
        PromptShieldModule,
        InputValidatorModule,
        AuditModule,
    ],
    controllers: [OrchestratorController, SessionController],
    providers: [
        OrchestratorService,
        OrchestratorGateway,
        {
            provide: "PG_POOL",
            useFactory: () =>
                new pg.Pool({ connectionString: process.env.DATABASE_URL }),
        },
        {
            provide: "AGENT_CALLBACK_GRAPH",
            useFactory: async (
                piiService: PiiRedactionService,
                outputEvaluator: OutputEvaluatorService,
                promptShield: PromptShieldService,
                auditService: AuditService,
            ) => {
                const geminiFlash = new ChatGoogleGenerativeAI({
                    model: "gemini-3-flash-preview",
                    apiKey: process.env.GEMINI_API_KEY,
                    temperature: 0,
                });

                const callbackModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "agent-callback",
                    },
                });

                return createAgentCallbackGraph({
                    piiService,
                    promptShield,
                    outputEvaluator,
                    auditService,
                    llm: callbackModel,
                    llmFallback: geminiFlash,
                });
            },
            inject: [
                PiiRedactionService,
                OutputEvaluatorService,
                PromptShieldService,
                AuditService,
            ],
        },
        {
            provide: "ORCHESTRATOR_GRAPH",
            useFactory: async (
                intentClassifier: IntentClassifierService,
                outputEvaluator: OutputEvaluatorService,
                orderService: OrderClientService,
                knowledgeClient: KnowledgeClientService,
                agentsClient: AgentsClientService,
                memoryService: MemoryClientService,
                promptShield: PromptShieldService,
                auditService: AuditService,
            ) => {
                const checkpointer = await createCheckpointer();

                const geminiFlash = new ChatGoogleGenerativeAI({
                    model: "gemini-3-flash-preview",
                    apiKey: process.env.GEMINI_API_KEY,
                    temperature: 0,
                });

                const geminiPro = new ChatGoogleGenerativeAI({
                    model: "gemini-3.1-pro-preview",
                    apiKey: process.env.GEMINI_API_KEY,
                    temperature: 0,
                });

                const sopModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "sop-handler",
                    },
                });

                const infoModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "info-handler",
                    },
                });

                const routingModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "routing-node",
                    },
                });

                const correctionModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "self-correction",
                    },
                });

                const aggregationModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "post-processing",
                    },
                });

                const endChatTool = tools.createEndChatSessionTool(
                    agentsClient,
                    memoryService,
                );
                const escalateTool =
                    tools.createEscalateToHumanTool(memoryService);
                const logisticsTool =
                    tools.createRouteToLogisticsTool(agentsClient);
                const resolutionTool =
                    tools.createRouteToResolutionTool(agentsClient);
                const faqTool = tools.createSearchFaqTool(knowledgeClient);
                const sopTool =
                    tools.createSearchInternalSopTool(knowledgeClient);

                return createOrchestratorGraph(
                    {
                        intentClassifier,
                        outputEvaluator,
                        orderService,
                        knowledgeClient,
                        promptShield,
                        auditService,
                        sopModel: sopModel,
                        sopModelFallback: geminiPro,
                        infoModel: infoModel,
                        infoModelFallback: geminiFlash,
                        routingModel: routingModel,
                        routingModelFallback: geminiFlash,
                        correctionModel: correctionModel,
                        correctionModelFallback: geminiPro,
                        aggregationModel: aggregationModel,
                        aggregationModelFallback: geminiFlash,
                        tools: [
                            endChatTool,
                            escalateTool,
                            logisticsTool,
                            resolutionTool,
                            faqTool,
                            sopTool,
                        ],
                    },
                    checkpointer,
                );
            },
            inject: [
                IntentClassifierService,
                OutputEvaluatorService,
                OrderClientService,
                KnowledgeClientService,
                AgentsClientService,
                MemoryClientService,
                PromptShieldService,
                AuditService,
            ],
        },
    ],
    exports: [
        OrchestratorService,
        "ORCHESTRATOR_GRAPH",
        "AGENT_CALLBACK_GRAPH",
        "PG_POOL",
    ],
})
export class OrchestratorModule {}
