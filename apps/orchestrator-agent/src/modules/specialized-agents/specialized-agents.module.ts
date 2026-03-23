import { Module } from "@nestjs/common";
import { SpecializedAgentsService } from "./specialized-agents.service";
import { McpToolRegistryModule } from "../mcp/mcp-tool-registry.module";
import { KnowledgeClientModule } from "../knowledge-client/knowledge-client.module";

@Module({
    imports: [McpToolRegistryModule, KnowledgeClientModule],
    providers: [SpecializedAgentsService],
    exports: [SpecializedAgentsService],
})
export class SpecializedAgentsModule {}
