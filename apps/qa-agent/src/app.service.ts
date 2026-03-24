import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { ChatOpenAI } from "@langchain/openai";
import { Runnable } from "@langchain/core/runnables";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import {
  HumanMessage,
  BaseMessage,
  AIMessage,
  ToolMessage,
  SystemMessage
} from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { CommonService } from "@libs/modules/common/common.service";
import {
  LogIncidentRequest,
  LogIncidentResponse,
} from "@libs/utils/rabbitmq-interfaces";

export enum IncidentType {
  LATE_DELIVERY = 'LATE_DELIVERY',
  MISSING_ITEMS = 'MISSING_ITEMS',
  WRONG_ORDER = 'WRONG_ORDER',
  DAMAGED_PACKAGING = 'DAMAGED_PACKAGING',
  PAYMENT_FAILURE = 'PAYMENT_FAILURE',
  OTHER = 'OTHER',
}

export const logIncidentTool = new DynamicStructuredTool({
  name: "log_incident",
  description: "Log a support incident when a customer problem occurred.",
  schema: z.object({
    type: z.enum(['LATE_DELIVERY', 'MISSING_ITEMS', 'WRONG_ORDER', 'DAMAGED_PACKAGING', 'PAYMENT_FAILURE', 'OTHER'])
      .describe("Incident category"),
    summary: z.string().describe("Short summary of the issue"),
    orderId: z.string().optional().describe("Order ID if applicable"),
    userId: z.string().optional().describe("User ID if applicable"),
  }),
  func: async () => {
    throw new Error("logIncidentTool.func not initialized");
  },
});

export const saveSentimentTool = new DynamicStructuredTool({
  name: "save_sentiment",
  description: "Save the overall sentiment score for the chat session. Always call this when reviewing a session.",
  schema: z.object({
    sessionId: z.string().describe("The chat session ID"),
    overallScore: z.number().min(-1).max(1).describe("Sentiment score between -1.0 (very negative) and 1.0 (very positive)"),
    shouldEscalate: z.boolean().describe("True if the customer is very upset (score <= -0.5)"),
    escalationReason: z.string().nullable().optional().describe("Short reason if shouldEscalate is true, otherwise null"),
  }),
  func: async () => {
    throw new Error("saveSentimentTool.func not initialized");
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
    @Inject("USER_SERVICE")
    private readonly userClient: ClientProxy,
  ) {
    // Rebind the tool implementation so we can access injected services
    (logIncidentTool as any).func = async (input: { type: string; summary: string; orderId?: string; userId?: string }) => {
      const response = await this.commonService.sendViaRMQ<LogIncidentResponse>(
        this.incidentClient,
        { cmd: "incident.log" },
        input,
      );
      return JSON.stringify(response);
    };

    (saveSentimentTool as any).func = async (input: { sessionId: string; overallScore: number; shouldEscalate: boolean; escalationReason?: string | null }) => {
      const result = await this.commonService.sendViaRMQ(
        this.userClient,
        { cmd: "user.sentiment.save" },
        input,
      );
      return JSON.stringify(result);
    };

    this.llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0,
    }).bindTools([logIncidentTool, saveSentimentTool]);

    const systemPrompt = `You are the QA Agent for OneDelivery. You serve two roles:

        ## ROLE 1: INCIDENT LOGGING 
        When you receive a message starting with "Please review this chat session.", you are analyzing the chat history between ochestrator agent and human for potential incidents.
        - Check if the chat indicates an incident(s) or not (e.g. late delivery, missing items, wrong order, damaged packaging, payment failure, etc.)
        - Incident Types MUST be one of: [LATE_DELIVERY, MISSING_ITEMS, WRONG_ORDER, DAMAGED_PACKAGING, PAYMENT_FAILURE, OTHER]
        - If an incident is detected, you MUST use the log_incident tool to record the incident with the appropriate type and summary. The summary should be a concise description of the issue.
        - Always include the user ID and order ID (if mentioned) when logging an incident.

        ## ROLE 2: Sentiment Analysis
        After reviewing a session, you MUST ALWAYS call the save_sentiment tool to save the overall sentiment score for this session.
        - The overall sentiment score of the messages should be between -1.0 and 1.0. 
        - Set shouldEscalate to true if the customer appears very upset (score <= -0.5).
        - Provide a short escalationReason if shouldEscalate is true.

        ## RULES
        - Be concise and use the shared chat history for context.
        - When reviewing a session, focus on identifying any customer issues and accurately assessing the sentiment. Do not make assumptions or guess about details not present in the chat history. If information is missing, it's better to log an incident with the available details than to guess.
        `;


//     const systemPrompt = `You are the QA Agent for OneDelivery Application. A food delivery platform support assistant. You handle incidents logging and sentiment tracking.

// - Help with: summarize incidents context and store incidents into our DB. Analyze incidents trends and provide insights.
// - Be concise and use the shared chat history for context.
// - You receive messages history from the Orchestrator.
// - If the conversation indicates a customer issue such as delivery failure, payment issue, refund issue, or application bug, you MUST use the log_incident tool to record the incident.
// - Always include the user ID and order ID (if mentioned) when logging an incident.
// - After review of the session, must call the save_sentiment tool at the end with the overall sentiment score of the messages (score between -1.0 and 1.0). Set shouldEscalate to true if the customer appears very upset (score <= -0.5). This helps track customer sentiment trends over time.`;

// - When reviewing a session, you MUST ALWAYS call the save_sentiment tool with the overall sentiment score of the messages (score between -1.0 and 1.0). Set shouldEscalate to true if the customer appears very upset (score <= -0.5).
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

//   @Cron(CronExpression.EVERY_HOUR)
//   async handleReviewIdleChatSessions() {
//     this.logger.log("Reviewing idle chat sessions...");

//     const request = {
//       status: "OPEN",
//       hoursAgo: 2,
//       reviewed: false,
//       userId: null,
//     };

//     const sessions = await this.commonService.sendViaRMQ<any[]>(
//       this.userClient,
//       { cmd: "user.chat.getSessionsByFilter" },
//       request,
//     );

//     this.logger.log(`Found ${sessions.length} idle sessions to review.`);
//     this.logger.log(`sessions :: `, sessions);

//     for (const session of sessions) {
//       if (session.reviewed) {
//         this.logger.log(`Session ${session.id} already reviewed, skipping.`);
//         continue;
//       }

//       this.logger.log(`Processing session ${session.id}...`);

//       // Extract userId from session
//       const userId = session.userId;
//       this.logger.log(`Extracted userId: ${userId}`);

//       // Convert messages to BaseMessage[]
//       const chatHistory: BaseMessage[] = session.messages.map((msg: any) => {
//         if (msg.type === "human") return new HumanMessage(msg.content);
//         if (msg.type === "ai") return new AIMessage(msg.content);
//         if (msg.type === "tool")
//           return new ToolMessage({
//             content: msg.content,
//             tool_call_id: msg.toolCallId ?? "",
//           });
//         return new HumanMessage(msg.content);
//       });

//       this.logger.log(`chatHistory :: `, chatHistory);

//       // Format prompt for review, including userId context
//       const formatted = await this.prompt.formatMessages({
//         chat_history: chatHistory,
//         input: `Please review this chat session and log any incidents if necessary. Summarize the issue and use the log_incident tool if applicable. Context: The user ID for this session is ${userId}. Extract the order ID from the conversation if mentioned.`,
//       });

//       // Invoke LLM
//       const response = (await this.llm.invoke(formatted)) as AIMessage;

//       // Handle tool calls
//       if (response.tool_calls && response.tool_calls.length > 0) {
//         for (const toolCall of response.tool_calls) {
//           if (toolCall.name === "log_incident") {
//             try {
//               const result = await logIncidentTool.func(
//                 JSON.stringify(toolCall.args),
//               );
//               this.logger.log(
//                 `Logged incident for session ${session.id}: ${result}`,
//               );
//             } catch (error) {
//               this.logger.error(
//                 `Failed to log incident for session ${session.id}: ${error.message}`,
//               );
//             }
//           }
//         }
//       } else {
//         this.logger.log(`No incident logged for session ${session.id}.`);
//       }

//       // Mark as reviewed
//       await this.commonService.sendViaRMQ<void>(
//         this.userClient,
//         { cmd: "user.chat.updateSession" },
//         { id: session.id, reviewed: true },
//       );

//       this.logger.log(`Marked session ${session.id} as reviewed.`);
//     }
//   }

  async processChatMessageBySessionId(
    userId: string,
    sessionId: string,
  ): Promise<string> {
    this.logger.log(
      `Processing session ${sessionId} for user ${userId} to check for incidents.`,
    );

    // Fetch the session with messages using getHistory
    const session = await this.commonService.sendViaRMQ<any>(
      this.userClient,
      { cmd: "user.chat.getHistory" },
      { userId, sessionId },
    );

    this.logger.log(`Fetched session data: ${JSON.stringify(session)}`);

    if (!session) {
      this.logger.warn(`Session ${sessionId} not found.`);
      return "Session not found.";
    }

    if (session.reviewed) {
      this.logger.log(`Session ${sessionId} already reviewed.`);
      return "Session already reviewed.";
    }

    // Verify userId matches
    if (session.userId !== userId) {
      this.logger.warn(
        `Session ${sessionId} does not belong to user ${userId}.`,
      );
      return "Session does not belong to user.";
    }

    if (session.messages.length === 0) {
      this.logger.log(`Session ${sessionId} has no messages.`);
      return "No messages in session.";
    }

    // Convert messages to BaseMessage[]
    const chatHistory: BaseMessage[] = session.messages.map((msg: any) => {
      if (msg.type === "human") return new HumanMessage(msg.content);
      if (msg.type === "ai") return new AIMessage(msg.content);
      if (msg.type === "system") return new SystemMessage(msg.content);
      if (msg.type === "tool")
        return new ToolMessage({
          content: msg.content,
          tool_call_id: msg.toolCallId ?? "",
        });
      
      return new HumanMessage(msg.content);
    });

    // Format prompt for review, passing sessionId as context so LLM can call save_sentiment
    const formattedReview = await this.prompt.formatMessages({
      chat_history: chatHistory,
      input: `Please review this chat session. Session ID: ${sessionId}. User ID: ${userId}. Extract the order ID from the conversation if mentioned. Log any incidents using log_incident if applicable. Then call save_sentiment with the overall sentiment score for this session.`,
    });

    // Invoke LLM
    const response = (await this.llm.invoke(formattedReview)) as AIMessage;

    let incidentLogged = false;

    // Handle tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        if (toolCall.name === "log_incident") {
          try {
            const result = await logIncidentTool.func(toolCall.args as any);
            this.logger.log(
              `Logged incident for session ${sessionId}: ${result}`,
            );
            incidentLogged = true;
          } catch (error) {
            this.logger.error(
              `Failed to log incident for session ${sessionId}: ${error.message}`,
            );
          }
        } 
        else if (toolCall.name === "save_sentiment") {
          try {
            const result = await saveSentimentTool.func({ ...toolCall.args, sessionId } as any);
            this.logger.log(
              `Saved sentiment for session ${sessionId}: ${result}`,
            );
          } catch (error) {
            this.logger.error(
              `Failed to save sentiment for session ${sessionId}: ${error.message}`,
            );
          }
        }
      }
    }

    // Mark as reviewed
    await this.commonService.sendViaRMQ<void>(
      this.userClient,
      { cmd: "user.chat.updateSession" },
      { id: session.id, reviewed: true },
    );

    this.logger.log(`Marked session ${sessionId} as reviewed.`);

    return incidentLogged
      ? "Incident logged for the session."
      : "No incident detected.";
  }
}
