import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { ChatOpenAI } from "@langchain/openai";
import { Runnable } from "@langchain/core/runnables";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DynamicTool } from "@langchain/core/tools";
import { CommonService } from "@libs/modules/common/common.service";
import {
  LogIncidentRequest,
  LogIncidentResponse,
} from "@libs/utils/rabbitmq-interfaces";

export const logIncidentTool = new DynamicTool({
  name: "log_incident",
  description: `
Use this tool to log a support incident when a customer problem occurred.

Required fields:
- type: incident category. MUST be one of: [LATE_DELIVERY, MISSING_ITEMS, WRONG_ORDER, DAMAGED_PACKAGING, PAYMENT_FAILURE, OTHER]
- summary: short summary of the issue
- orderId: order ID if applicable
`,
  // The actual implementation is provided in the AppService constructor
  func: async () => {
    throw new Error("logIncidentTool.func not initialized");
  },
});

/**
 * QA specialist agent. Invoked by the orchestrator via TCP (agent.chat).
 * Processes product questions, FAQs, and quality feedback. Responds back to the
 * orchestrator with a string reply (no routing tools).
 */
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly llm: Runnable;
  private readonly prompt: ChatPromptTemplate;

  constructor(
    private memoryService: MemoryService,
    private readonly commonService: CommonService,
    @Inject("INCIDENT_SERVICE")
    private readonly incidentClient: ClientProxy,
  ) {
    // Rebind the tool implementation so we can access injected services
    (logIncidentTool as any).func = async (input: string) => {
      const data = JSON.parse(input) as LogIncidentRequest;

      const response =
        await this.commonService.sendViaRMQ<LogIncidentResponse>(
          this.incidentClient,
          { cmd: "incident.log" },
          data,
        );

      return JSON.stringify(response);
    };

    this.llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0,
    }).bindTools([logIncidentTool]);

    const systemPrompt = `You are the QA Agent for OneDelivery Application. A food delivery platform support assistant. You handle incidents logging and incidents trend analysis.

- Help with: summarize incidents context and store incidents into our DB. Analyze incidents trends and provide insights.
- Be concise and use the shared chat history for context.
- You receive messages history from the Orchestrator; 
- If the conversation indicates a customer issue such as delivery failure,
payment issue, refund issue, or application bug, you MUST use the
log_incident tool to record the incident.`;

    this.prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
    ]);
  }

  /**
   * Process a message from the orchestrator. Uses shared DB (orchestrator schema)
   * for history, then returns the reply string back to the orchestrator.
   */
  async processChat(
    userId: string,
    sessionId: string,
    message: string,
  ): Promise<string> {
    this.logger.log(`[${userId}] QA Agent received: "${message}"`);

    const chatHistory = await this.memoryService.getHistory(userId, sessionId);
    const newHumanMessage = new HumanMessage(message);
    chatHistory.push(newHumanMessage);

    const formatted = await this.prompt.formatMessages({
      chat_history: chatHistory,
      input: message,
    });

    const response = (await this.llm.invoke(formatted)) as BaseMessage;
    const reply =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    chatHistory.push(response);
    await this.memoryService.saveHistory(userId, sessionId, chatHistory);

    this.logger.log(`[${userId}] QA Agent reply: "${reply}"`);
    return reply;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleReviewIdleChatSessions() {
    this.logger.log(
      "handleReviewIdleChatSessions is currently disabled (chat sessions moved to user service).",
    );
  }
}
