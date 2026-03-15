import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { OrchestratorAgentController } from "./orchestrator-agent.controller";
import { OrchestratorAgentService } from "./orchestrator-agent.service";
import { MemoryModule } from "./memory/memory.module";
import { AgentsModule } from "./agents/agents.module";
import { CommonModule } from "@libs/modules/common/common.module";
import { KnowledgeModule } from "./agents/knowledge.module";

@Module({
    imports: [
        CommonModule,
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        HttpModule,
        MemoryModule,
        AgentsModule,
        KnowledgeModule,
    ],
    controllers: [OrchestratorAgentController],
    providers: [OrchestratorAgentService],
})
export class AppModule {}
