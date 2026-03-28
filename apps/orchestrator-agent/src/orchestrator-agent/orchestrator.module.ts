import { Module, Global } from "@nestjs/common";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorService } from "./orchestrator.service";
import { PiiRedactionModule } from "../modules/pii-redaction/pii-redaction.module";
import { InputValidatorModule } from "../modules/input-validator/input-validator.module";
import { SemanticRouterModule } from "../modules/semantic-router/semantic-router.module";
import { OutputEvaluatorModule } from "../modules/output-evaluator/output-evaluator.module";
import { SummarizerModule } from "../modules/summarizer/summarizer.module";
import { KnowledgeClientModule } from "../modules/clients/knowledge-client/knowledge-client.module";
import { OrderClientModule } from "../modules/clients/order-client/order-client.module";
import { AgentsClientModule } from "../modules/clients/agents-client/agents-client.module";
import { MemoryClientModule } from "../modules/clients/memory-client/memory-client.module";
import { createOrchestratorGraph } from "./graph";
import { createCheckpointer } from "./checkpointer";
import { ChatOpenAI } from "@langchain/openai";
import { PiiRedactionService } from "../modules/pii-redaction/pii-redaction.service";
import { InputValidatorService } from "../modules/input-validator/input-validator.service";
import { SemanticRouterService } from "../modules/semantic-router/semantic-router.service";
import { OutputEvaluatorService } from "../modules/output-evaluator/output-evaluator.service";
import { SummarizerService } from "../modules/summarizer/summarizer.service";
import { KnowledgeClientService } from "../modules/clients/knowledge-client/knowledge-client.service";
import { OrderClientService } from "../modules/clients/order-client/order-client.service";
import { AgentsClientService } from "../modules/clients/agents-client/agents-client.service";
import { MemoryClientService } from "../modules/clients/memory-client/memory-client.service";
import * as tools from "./tools";

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
    controllers: [OrchestratorController],
    providers: [
        OrchestratorService,
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
            ) => {
                const checkpointer = await createCheckpointer();

                const strongModel = new ChatOpenAI({
                    modelName: "gpt-4o",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "orchestrator-strong",
                    },
                    tags: ["production", "orchestrator"],
                });

                const lightModel = new ChatOpenAI({
                    modelName: "gpt-4o-mini",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                    metadata: {
                        environment: "production",
                        component: "orchestrator-light",
                    },
                    tags: ["production", "orchestrator"],
                });

                const endChatTool =
                    tools.createEndChatSessionTool(agentsClient);
                const logisticsTool =
                    tools.createRouteToLogisticsTool(agentsClient);
                const resolutionTool =
                    tools.createRouteToResolutionTool(agentsClient);
                const faqTool = tools.createSearchFaqTool(knowledgeClient);
                const sopTool =
                    tools.createSearchInternalSopTool(knowledgeClient);

                return createOrchestratorGraph(
                    {
                        piiService,
                        inputValidator,
                        semanticRouter,
                        outputEvaluator,
                        orderService,
                        summarizer,
                        knowledgeClient,
                        agentsClient,
                        strongModel,
                        lightModel,
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
        {
            provide: "WS_CLIENTS",
            useValue: new Map(),
        },
    ],
    exports: [OrchestratorService, "ORCHESTRATOR_GRAPH", "WS_CLIENTS"],
})
export class OrchestratorModule {}
