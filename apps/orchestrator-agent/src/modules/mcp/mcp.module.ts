import { Module } from "@nestjs/common";
import { McpToolRegistryService } from "./mcp-tool-registry.service";
import { AgentsClientModule } from "../agents-client/agents-client.module";
import { KnowledgeClientModule } from "../knowledge-client/knowledge-client.module";

@Module({
    imports: [AgentsClientModule, KnowledgeClientModule],
    providers: [McpToolRegistryService],
    exports: [McpToolRegistryService],
})
export class McpModule {}
