import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { MemoryModule } from "./memory/memory.module";
import { ChatMessage } from "./database/entities/chat-message.entity";
import { ChatSession } from "./database/entities/chat-session.entity";

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
            entities: [ChatMessage, ChatSession],
            synchronize: process.env.NODE_ENV !== "production",
        }),
        HttpModule,
        MemoryModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
