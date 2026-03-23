import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { StructuredTool } from "@langchain/core/tools";
import { AgentsClientService } from "../agents-client/agents-client.service";
import { KnowledgeClientService } from "../knowledge-client/knowledge-client.service";
import { createRouteToLogisticsTool } from "../../tools/route-to-logistics.tool";
import { createRouteToResolutionTool } from "../../tools/route-to-resolution.tool";
import { createEndChatSessionTool } from "../../tools/end-chat-session.tool";
import { createSearchInternalSopTool } from "../../tools/search-internal-sop.tool";
import { createSearchFaqTool } from "../../tools/search-faq.tool";
import { createEscalateToHumanTool } from "../../tools/escalate-to-human.tool";
import { createGetUserRecentOrdersTool } from "../../tools/get-user-recent-orders.tool";
import { MemoryService } from "../memory/memory.service";

@Injectable()
export class McpToolRegistryService implements OnModuleInit {
    private readonly logger = new Logger(McpToolRegistryService.name);
    private tools: Map<string, StructuredTool> = new Map();

    constructor(
        private agentsClientService: AgentsClientService,
        private knowledgeClientService: KnowledgeClientService,
        private memoryService: MemoryService,
    ) {}

    onModuleInit() {
        // Register all available tools during module initialization
        this.registerTool(createRouteToLogisticsTool(this.agentsClientService));
        this.registerTool(
            createRouteToResolutionTool(this.agentsClientService),
        );
        this.registerTool(
            createEndChatSessionTool(
                this.agentsClientService,
                this.memoryService,
            ),
        );
        this.registerTool(
            createSearchInternalSopTool(this.knowledgeClientService),
        );
        this.registerTool(createSearchFaqTool(this.knowledgeClientService));
        this.registerTool(createEscalateToHumanTool(this.agentsClientService));
        this.registerTool(
            createGetUserRecentOrdersTool(this.agentsClientService),
        );
    }

    registerTool(tool: StructuredTool) {
        this.tools.set(tool.name, tool);
        this.logger.log(`Registered MCP Tool: ${tool.name}`);
    }

    getTool(name: string): StructuredTool | undefined {
        return this.tools.get(name);
    }

    getAllTools(): StructuredTool[] {
        return Array.from(this.tools.values());
    }

    getAvailableToolNames(): string[] {
        return Array.from(this.tools.keys());
    }
}
