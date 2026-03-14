import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorService } from "./orchestrator.service";
import { MemoryModule } from "./memory/memory.module";
import { AgentsModule } from "./agents/agents.module";
import { CommonModule } from "@libs/modules/common/common.module";

@Module({
  imports: [
    CommonModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    MemoryModule,
    AgentsModule,
  ],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
})
export class AppModule {}
