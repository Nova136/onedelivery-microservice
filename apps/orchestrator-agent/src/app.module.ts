import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { OrchestratorModule } from "./orchestrator-agent/orchestrator.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        OrchestratorModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
