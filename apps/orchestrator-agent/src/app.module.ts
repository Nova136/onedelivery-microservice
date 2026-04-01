import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "@libs/modules/health-check/health-check.module";
import { OrchestratorModule } from "./orchestrator-agent/orchestrator.module";

@Module({
    imports: [
        HealthModule,
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        OrchestratorModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
