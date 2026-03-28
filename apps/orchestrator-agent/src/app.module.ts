import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { OrchestratorAgentController } from "./orchestrator-agent.controller";
import { OrchestratorAgentService } from "./orchestrator-agent.service";
import { MemoryModule } from "./modules/memory/memory.module";

import { ModerationModule } from "./modules/moderation/moderation.module";
import { PrivacyModule } from "./modules/privacy/privacy.module";
import { McpToolRegistryModule } from "./modules/mcp/mcp-tool-registry.module";
import { SemanticRouterModule } from "./modules/semantic-router/semantic-router.module";
import { SpecializedAgentsModule } from "./modules/specialized-agents/specialized-agents.module";
import { WebsocketCallbackModule } from "./modules/websocket/websocket-callback.module";

@Module({
    imports: [
        MemoryModule,
        ModerationModule,
        PrivacyModule,
        McpToolRegistryModule,
        SemanticRouterModule,
        SpecializedAgentsModule,
        WebsocketCallbackModule,
    ],
    controllers: [OrchestratorAgentController],
    providers: [OrchestratorAgentService],
})
export class AppModule {}
