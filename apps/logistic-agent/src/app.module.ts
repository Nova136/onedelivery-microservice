import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorService } from "./orchestrator.service";
import { MemoryModule } from "./memory/memory.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        HttpModule,
        MemoryModule,
    ],
    controllers: [OrchestratorController],
    providers: [OrchestratorService],
})
export class AppModule {}
