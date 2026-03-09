import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import { Runnable } from "@langchain/core/runnables";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";
import { Cron, CronExpression, ScheduleModule } from '@nestjs/schedule';
import { DynamicTool } from "@langchain/core/tools";
import axios from "axios";

export const logIncidentTool = new DynamicTool({
  name: "log_incident",
  description: `
Use this tool to log a support incident when a customer problem occurred.

Required fields:
- type: incident category (DELIVERY, PAYMENT, REFUND, APP_ERROR)
- summary: short summary of the issue
- orderId: order ID if applicable
`,
  func: async (input: string) => {
    const data = JSON.parse(input);

    const response = await axios.post(
      "http://localhost:3006/incidents/log-incidents",
      data
    );

    return JSON.stringify(response.data);
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

    constructor(private memoryService: MemoryService) {
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

        const chatHistory = await this.memoryService.getHistory(
            userId,
            sessionId,
        );
        const newHumanMessage = new HumanMessage(message);
        chatHistory.push(newHumanMessage);

        const formatted = await this.prompt.formatMessages({
            chat_history: chatHistory,
            input: message,
        });

        const response = await this.llm.invoke(formatted) as BaseMessage;
        const reply = typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        chatHistory.push(response);
        await this.memoryService.saveHistory(userId, sessionId, chatHistory);

        this.logger.log(`[${userId}] QA Agent reply: "${reply}"`);
        return reply;
    }

  @Cron(CronExpression.EVERY_HOUR)
  async handleReviewIdleChatSessions() {
    this.logger.log("Checking idle chat sessions...");

    const sessions = await this.memoryService.getIdleSessions();
    // Process each idle chat_message session and check for incidents
    for (const session of sessions) {
      try {
        await this.processChat(
          session.userId,
          session.sessionId,
          "Summarize this conversation and determine if an incident occurred."
        );

      } catch (err) {
        this.logger.error(`Failed processing session ${session.sessionId}`, err);
      }
    }
  }
}
