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
import { InputValidatorModule } from "../modules/input-validator/input-validator.module";
import { InputValidatorService } from "../modules/input-validator/input-validator.service";
import { OutputEvaluatorModule } from "../modules/output-evaluator/output-evaluator.module";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";
import { PiiRedactionModule } from "../modules/pii-redaction/pii-redaction.module";
import { PiiRedactionService } from "../modules/pii-redaction/pii-redaction.service";
import { SemanticRouterModule } from "../modules/semantic-router/semantic-router.module";
import { SemanticRouterService } from "../modules/semantic-router/semantic-router.service";
import { SummarizerModule } from "../modules/summarizer/summarizer.module";
import { SummarizerService } from "../modules/summarizer/summarizer.service";
import { createCheckpointer } from "./checkpointer";
import { createOrchestratorGraph } from "./graph";
import { OrchestratorGateway } from "./orchestrator.gateway";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorService } from "./orchestrator.service";
import * as tools from "./tools";
import { SessionController } from "./session.controller";

@Global()
@Module({
    imports: [
        PiiRedactionModule,
        InputValidatorModule,
        SemanticRouterModule,
        OutputEvaluatorModule,
        KnowledgeClientModule,
        OrderClientModule,
        AgentsClientModule,
        MemoryClientModule,
        SummarizerModule,
    ],
    controllers: [OrchestratorController, SessionController],
    providers: [
        OrchestratorService,
        OrchestratorGateway,
        {
            provide: "ORCHESTRATOR_GRAPH",
            useFactory: async (
                piiService: PiiRedactionService,
                inputValidator: InputValidatorService,
                semanticRouter: SemanticRouterService,
                outputEvaluator: OutputEvaluatorService,
                orderService: OrderClientService,
                summarizer: SummarizerService,
                knowledgeClient: KnowledgeClientService,
                agentsClient: AgentsClientService,
                memoryService: MemoryClientService,
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
                    modelName: "gpt-5.4",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "sop-handler",
                    },
                });

                const sopModelFallback = new ChatGoogleGenerativeAI({
                    model: "gemini-3.1-pro-preview",
                    apiKey: process.env.GEMINI_API_KEY,
                    temperature: 0,
                });

                const infoModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "info-handler",
                    },
                }).withFallbacks({ fallbacks: [geminiFlash] });

                const routingModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "routing-node",
                    },
                }).withFallbacks({ fallbacks: [geminiFlash] });

                const correctionModel = new ChatOpenAI({
                    modelName: "gpt-5.4",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "self-correction",
                    },
                }).withFallbacks({ fallbacks: [geminiPro] });

                const aggregationModel = new ChatOpenAI({
                    modelName: "gpt-5.4-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "post-processing",
                    },
                }).withFallbacks({ fallbacks: [geminiFlash] });

                const endChatTool = tools.createEndChatSessionTool(
                    agentsClient,
                    memoryService,
                );
                const logisticsTool =
                    tools.createRouteToLogisticsTool(agentsClient);
                const resolutionTool =
                    tools.createRouteToResolutionTool(agentsClient);
                const faqTool = tools.createSearchFaqTool(knowledgeClient);
                const sopTool =
                    tools.createSearchInternalSopTool(knowledgeClient);

                return createOrchestratorGraph(
                    {
                        inputValidator,
                        semanticRouter,
                        outputEvaluator,
                        orderService,
                        summarizer,
                        knowledgeClient,
                        sopModel: sopModel,
                        sopModelFallback: sopModelFallback,
                        infoModel: infoModel as any,
                        routingModel: routingModel as any,
                        correctionModel: correctionModel as any,
                        aggregationModel: aggregationModel as any,
                        tools: [
                            endChatTool,
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
                PiiRedactionService,
                InputValidatorService,
                SemanticRouterService,
                OutputEvaluatorService,
                OrderClientService,
                SummarizerService,
                KnowledgeClientService,
                AgentsClientService,
                MemoryClientService,
            ],
        },
    ],
    exports: [OrchestratorService, "ORCHESTRATOR_GRAPH"],
})
export class OrchestratorModule {}
