import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import { Runnable } from "@langchain/core/runnables";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";
import { Cron, CronExpression, ScheduleModule } from "@nestjs/schedule";
import { DynamicTool } from "@langchain/core/tools";
import { Repository, LessThan } from "typeorm";

import axios from "axios";
import { InjectRepository } from "@nestjs/typeorm";
import { ChatSession } from "./database/entities/chat-session.entity";
import { ChatMessage } from "./database/entities/chat-message.entity";

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
      data,
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

  constructor(
    private memoryService: MemoryService,
    @InjectRepository(ChatSession)
    private readonly chatSessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
  ) {
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
    this.logger.log("Checking idle chat sessions...");

    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    // 1. Find sessions that are OPEN, not reviewed, and haven't been touched in 1h
    const idleSessions = await this.chatSessionRepository.find({
      where: {
        status: "OPEN",
        reviewed: false,
        updatedAt: LessThan(oneHourAgo),
      },
    });

    if (idleSessions.length === 0) {
      this.logger.log("No idle sessions found.");
      return;
    }

    for (const session of idleSessions) {
      try {
        // 2. Discover the userId from the messages in this session
        const firstMessage = await this.chatMessageRepository.findOne({
          where: { sessionId: { id: session.id } },
          select: ["userId"],
        });

        if (!firstMessage) {
          // Empty session - just close it
          session.status = "CLOSED";
          session.reviewed = true;
          await this.chatSessionRepository.save(session);
          continue;
        }

        const userId = firstMessage.userId;

        // 3. Use MemoryService to get the formatted LangChain history
        const history = await this.memoryService.getHistory(userId, session.id);

        // 4. Send the history to the LLM for a final "QA Review"
        const reviewRequest =
          "The user has gone quiet. Review this chat: if there's a DELIVERY, PAYMENT, or REFUND issue that wasn't logged yet, use the log_incident tool now. Otherwise, respond 'No action needed'.";

        const formattedMessages = await this.prompt.formatMessages({
          chat_history: history,
          input: reviewRequest,
        });

        // This call will trigger the 'log_incident' tool if the LLM sees a problem
        const response = await this.llm.invoke(formattedMessages);

        // 5. Update session status
        session.status = "CLOSED";
        session.reviewed = true;
        await this.chatSessionRepository.save(session);

        this.logger.log(
          `Session ${session.id} (User: ${userId}) reviewed and archived.`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to review session ${session.id}: ${error.message}`,
        );
      }
    }
  }
}
