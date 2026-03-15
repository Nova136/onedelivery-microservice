import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { CommonModule } from "@libs/modules/common/common.module";
import { AgentsModule } from "./agents/agents.module";
import { ResolutionController } from "./resolution.controller";
import { ResolutionService } from "./resolution.service";

@Module({
    imports: [
        CommonModule,
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        HttpModule,
        AgentsModule,
    ],
    controllers: [ResolutionController],
    providers: [ResolutionService],
})
export class AppModule {}
