import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredTool } from "@langchain/core/tools";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { GraphState } from "../../state/graph.state";
import { McpToolRegistryService } from "../mcp/mcp-tool-registry.service";
import {
    ACTION_AGENT_PROMPT,
    FAQ_AGENT_PROMPT,
} from "./prompts/specialized-agents.prompt";
import { KnowledgeClientService } from "../knowledge-client/knowledge-client.service";

@Injectable()
export class SpecializedAgentsService {
    private readonly logger = new Logger(SpecializedAgentsService.name);
    private actionLlm: ChatOpenAI;
    private faqLlm: ChatOpenAI;

    constructor(
        private mcpToolRegistry: McpToolRegistryService,
        private knowledgeClientService: KnowledgeClientService,
    ) {
        this.actionLlm = new ChatOpenAI({
            modelName: "gpt-4o", // More capable model for complex SOP logic
            temperature: 0,
        });
        this.faqLlm = new ChatOpenAI({
            modelName: "gpt-4o-mini", // Faster, cost-effective model for simple QA
            temperature: 0,
        });
    }

    async invokeActionAgent(state: typeof GraphState.State) {
        this.logger.log(
            `[${state.userId}] Iteration ${state.iterations + 1}: Thinking as Action agent...`,
        );

        const currentTools = Array.from(state.activeToolNames)
            .map((name) => this.mcpToolRegistry.getTool(name))
            .filter(Boolean) as StructuredTool[];
        const orchestratorWithTools = this.actionLlm.bindTools(currentTools);

        const promptTemplate = ChatPromptTemplate.fromMessages([
            ["system", ACTION_AGENT_PROMPT],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        const sopList = await this.knowledgeClientService.listSops();
        const supportedWorkflows = sopList
            .map((sop) => `- ${sop.intentCode}: ${sop.title}`)
            .join("\n");

        const formattedPrompt = await promptTemplate.formatMessages({
            chat_history: state.contextWindow,
            input: state.message,
            agent_scratchpad: state.scratchpad,
            userId: state.userId,
            sessionId: state.sessionId,
            activeOrderId: state.activeOrderId,
            supportedWorkflows: supportedWorkflows,
        });

        const response = await orchestratorWithTools.invoke(formattedPrompt);
        if (response.content && String(response.content).length > 0) {
            this.logger.log(
                `[${state.userId}] Action Agent Thought: ${response.content}`,
            );
        }

        return { scratchpad: [response], iterations: 1 };
    }

    async invokeFaqAgent(state: typeof GraphState.State) {
        this.logger.log(
            `[${state.userId}] Iteration ${state.iterations + 1}: Thinking as FAQ agent...`,
        );

        const currentTools = Array.from(state.activeToolNames)
            .map((name) => this.mcpToolRegistry.getTool(name))
            .filter(Boolean) as StructuredTool[];
        const orchestratorWithTools = this.faqLlm.bindTools(currentTools);

        const promptTemplate = ChatPromptTemplate.fromMessages([
            ["system", FAQ_AGENT_PROMPT],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        const formattedPrompt = await promptTemplate.formatMessages({
            chat_history: state.contextWindow,
            input: state.message,
            agent_scratchpad: state.scratchpad,
        });

        const response = await orchestratorWithTools.invoke(formattedPrompt);
        if (response.content && String(response.content).length > 0) {
            this.logger.log(
                `[${state.userId}] FAQ Agent Thought: ${response.content}`,
            );
        }

        return { scratchpad: [response], iterations: 1 };
    }
}
