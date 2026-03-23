import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./database/entities/user.entity";
import { ChatSession } from "./database/entities/chat-session.entity";
import { ChatMessage } from "./database/entities/chat-message.entity";
import { AuthModule } from "./auth/auth.module";
import { ClientAuthGuard } from "@libs/utils/guards/auth.guard";
import { HealthModule } from "@libs/modules/health-check/health-check.module";
import { ChatService } from "./chat/chat.service";
import { ChatController } from "./chat/chat.controller";
import { CommonModule } from "@libs/modules/common/common.module";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { Sentiment } from "./database/entities/sentiment.entity";
import { SentimentController } from "./sentiment/sentiment.controller";
import { SentimentService } from "./sentiment/sentiment.service";

@Module({
    imports: [
        CommonModule,
        HealthModule,
        ConfigModule.forRoot({
            envFilePath: [".env"],
        }),
        AuthModule,
        TypeOrmModule.forRoot({
            type: "postgres",
            url:
                process.env.DATABASE_URL ??
                "postgresql://postgres:postgres@localhost:5432/onedelivery",
            schema: "user",
            entities: [User, ChatSession, ChatMessage, Sentiment],
            synchronize: process.env.NODE_ENV !== "production",
            namingStrategy: new SnakeNamingStrategy(),
        }),
        TypeOrmModule.forFeature([ChatMessage, ChatSession, Sentiment]),
    ],
    controllers: [ChatController, SentimentController],
    providers: [ClientAuthGuard, ChatService, SentimentService],
})
export class AppModule {}
