import { Module } from "@nestjs/common";
import { McpToolRegistryService } from "./mcp-tool-registry.service";
import { AgentsClientModule } from "../agents-client/agents-client.module";
import { KnowledgeClientModule } from "../knowledge-client/knowledge-client.module";
import { MemoryModule } from "../memory/memory.module";

@Module({
    imports: [AgentsClientModule, KnowledgeClientModule, MemoryModule],
    providers: [McpToolRegistryService],
    exports: [McpToolRegistryService],
})
export class McpModule {}
