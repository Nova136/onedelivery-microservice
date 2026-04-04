import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { HealthModule } from "@libs/modules/health-check/health-check.module";
import { OrchestratorModule } from "./orchestrator-agent/orchestrator.module";
import { LoggerModule } from "nestjs-pino";
import { WsConnection } from "./database/entities/ws-connection.entity";
import { WsRateLimit } from "./database/entities/ws-rate-limit.entity";

@Module({
    imports: [
        HealthModule,
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        LoggerModule.forRoot({
            pinoHttp: {
                transport:
                    process.env.NODE_ENV !== "production"
                        ? {
                              target: "pino-pretty",
                              options: { singleLine: true },
                          }
                        : undefined,
            },
        }),
        TypeOrmModule.forRoot({
            type: "postgres",
            url:
                process.env.DATABASE_URL ??
                "postgresql://postgres:postgres@localhost:5432/onedelivery",
            schema: "ws",
            entities: [WsConnection, WsRateLimit],
            synchronize: false,
            ssl:
                process.env.NODE_ENV === "production"
                    ? { rejectUnauthorized: false }
                    : false,
            namingStrategy: new SnakeNamingStrategy(),
        }),
        TypeOrmModule.forFeature([WsConnection, WsRateLimit]),
        OrchestratorModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
