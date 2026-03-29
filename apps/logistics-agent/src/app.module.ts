import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { ScheduleModule } from "@nestjs/schedule";
import { LogisticsAgentController } from "./logistics-agent.controller";
import { LogisticsAgentService } from "./logistics-agent.service";
import { AgentsModule } from "./agents/agents.module";
import { CommonModule } from "@libs/modules/common/common.module";
import { OrderModule } from "./agents/order.module";
import { KnowledgeModule } from "./agents/knowledge.module";
import { ResolutionModule } from "./agents/resolution.module";

@Module({
    imports: [
        CommonModule,
        ScheduleModule.forRoot(),
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        HttpModule,
        AgentsModule,
        KnowledgeModule,
        OrderModule,
    ],
    controllers: [LogisticsAgentController],
    providers: [LogisticsAgentService],
})
export class AppModule {}
