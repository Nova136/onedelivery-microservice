import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "@libs/modules/health-check/health-check.module";
import { OrchestratorModule } from "./orchestrator-agent/orchestrator.module";
import { LoggerModule } from "nestjs-pino";

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
        OrchestratorModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
