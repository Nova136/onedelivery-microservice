import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { CommonModule } from "@libs/modules/common/common.module";
import { AgentsModule } from "./agents/agents.module";
import { HealthModule } from "@libs/modules/health-check/health-check.module";
import { ResolutionController } from "./resolution.controller";
import { ResolutionService } from "./resolution.service";

@Module({
    imports: [
        CommonModule,
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        HttpModule,
        HealthModule,
        AgentsModule,
    ],
    controllers: [ResolutionController],
    providers: [ResolutionService],
})
export class AppModule {}
