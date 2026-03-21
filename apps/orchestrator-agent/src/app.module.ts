import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { OrchestratorAgentController } from "./orchestrator-agent.controller";
import { OrchestratorAgentService } from "./orchestrator-agent.service";
import { MemoryModule } from "./memory/memory.module";
import { AgentsClientModule } from "./modules/agents-client/agents-client.module";
import { CommonModule } from "@libs/modules/common/common.module";
import { KnowledgeClientModule } from "./modules/knowledge-client/knowledge-client.module";
import { ModerationModule } from "./modules/moderation/moderation.module";

@Module({
    imports: [
        CommonModule,
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        HttpModule,
        MemoryModule,
        AgentsClientModule,
        KnowledgeClientModule,
        ModerationModule,
    ],
    controllers: [OrchestratorAgentController],
    providers: [OrchestratorAgentService],
})
export class AppModule {}
