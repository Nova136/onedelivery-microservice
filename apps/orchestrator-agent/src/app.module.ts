import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorService } from "./orchestrator.service";
import { MemoryModule } from "./memory/memory.module";
import { AgentsModule } from "./agents/agents.module";
import { ChatMessage } from "./database/entities/chat-message.entity";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        TypeOrmModule.forRoot({
            type: "postgres",
            url:
                process.env.DATABASE_URL ??
                "postgresql://postgres:postgres@localhost:5432/onedelivery",
            schema: "orchestrator",
            entities: [ChatMessage],
            synchronize: process.env.NODE_ENV !== "production",
        }),
        HttpModule,
        MemoryModule,
        AgentsModule,
    ],
    controllers: [OrchestratorController],
    providers: [OrchestratorService],
})
export class AppModule {}
