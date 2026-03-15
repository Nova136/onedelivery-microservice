import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { ChatOpenAI } from "@langchain/openai";
import { Runnable } from "@langchain/core/runnables";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, BaseMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
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
- userId: user ID if applicable
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
    @Inject("USER_SERVICE")
    private readonly userClient: ClientProxy,
  ) {
    // Rebind the tool implementation so we can access injected services
    (logIncidentTool as any).func = async (input: string) => {
      const data = JSON.parse(input) as LogIncidentRequest;

      const response = await this.commonService.sendViaRMQ<LogIncidentResponse>(
        this.incidentClient,
        { cmd: "log-incidents" },
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
    this.logger.log("Reviewing idle chat sessions...");

    const request = {
      status: "OPEN",
      hoursAgo: 2,
      reviewed: false,
      userId: null,
    };

    const sessions = await this.commonService.sendViaRMQ<any[]>(
      this.userClient,
      { cmd: "user.chat.getSessionsByFilter" },
      request,
    );

    this.logger.log(`Found ${sessions.length} idle sessions to review.`);
    this.logger.log(`sessions :: `, sessions);

    for (const session of sessions) {
      if (session.reviewed) {
        this.logger.log(`Session ${session.id} already reviewed, skipping.`);
        continue;
      }

      this.logger.log(`Processing session ${session.id}...`);

      // Extract userId from session
      const userId = session.userId;
      this.logger.log(`Extracted userId: ${userId}`);

      // Convert messages to BaseMessage[]
      const chatHistory: BaseMessage[] = session.messages.map((msg: any) => {
        if (msg.type === 'human') return new HumanMessage(msg.content);
        if (msg.type === 'ai') return new AIMessage(msg.content);
        if (msg.type === 'tool')
          return new ToolMessage({
            content: msg.content,
            tool_call_id: msg.toolCallId ?? '',
          });
        return new HumanMessage(msg.content);
      });

      this.logger.log(`chatHistory :: `, chatHistory);

      // Format prompt for review, including userId context
      const formatted = await this.prompt.formatMessages({
        chat_history: chatHistory,
        input: `Please review this chat session and log any incidents if necessary. Summarize the issue and use the log_incident tool if applicable. Context: The user ID for this session is ${userId}. Extract the order ID from the conversation if mentioned.`,
      });

      // Invoke LLM
      const response = (await this.llm.invoke(formatted)) as AIMessage;

      // Handle tool calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const toolCall of response.tool_calls) {
          if (toolCall.name === 'log_incident') {
            try {
              const result = await logIncidentTool.func(JSON.stringify(toolCall.args));
              this.logger.log(`Logged incident for session ${session.id}: ${result}`);
            } catch (error) {
              this.logger.error(`Failed to log incident for session ${session.id}: ${error.message}`);
            }
          }
        }
      } else {
        this.logger.log(`No incident logged for session ${session.id}.`);
      }

      // Mark as reviewed
      await this.commonService.sendViaRMQ<void>(
        this.userClient,
        { cmd: "user.chat.updateSession" },
        { id: session.id, reviewed: true },
      );

      this.logger.log(`Marked session ${session.id} as reviewed.`);
    }
  }

  async processChatMessageBySessionId(
    userId: string,
    sessionId: string
  ): Promise<string> {
    this.logger.log(`Processing session ${sessionId} for user ${userId} to check for incidents.`);

    // Fetch the session with messages using getHistory
    const session = await this.commonService.sendViaRMQ<any>(
      this.userClient,
      { cmd: "user.chat.getHistory" },
      { sessionId },
    );

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
      this.logger.warn(`Session ${sessionId} does not belong to user ${userId}.`);
      return "Session does not belong to user.";
    }

    if (session.messages.length === 0) {
      this.logger.log(`Session ${sessionId} has no messages.`);
      return "No messages in session.";
    }

    // Convert messages to BaseMessage[]
    const chatHistory: BaseMessage[] = session.messages.map((msg: any) => {
      if (msg.type === 'human') return new HumanMessage(msg.content);
      if (msg.type === 'ai') return new AIMessage(msg.content);
      if (msg.type === 'tool')
        return new ToolMessage({
          content: msg.content,
          tool_call_id: msg.toolCallId ?? '',
        });
      return new HumanMessage(msg.content);
    });

    // Format prompt for review
    const formatted = await this.prompt.formatMessages({
      chat_history: chatHistory,
      input: `Please review this chat session and log any incidents if necessary. Summarize the issue and use the log_incident tool if applicable. Context: The user ID for this session is ${userId}. Extract the order ID from the conversation if mentioned.`,
    });

    // Invoke LLM
    const response = (await this.llm.invoke(formatted)) as AIMessage;

    let incidentLogged = false;

    // Handle tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        if (toolCall.name === 'log_incident') {
          try {
            const result = await logIncidentTool.func(JSON.stringify(toolCall.args));
            this.logger.log(`Logged incident for session ${sessionId}: ${result}`);
            incidentLogged = true;
          } catch (error) {
            this.logger.error(`Failed to log incident for session ${sessionId}: ${error.message}`);
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

    return incidentLogged ? "Incident logged for the session." : "No incident detected.";
  }
}
