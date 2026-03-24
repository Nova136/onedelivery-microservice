import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import {
  HumanMessage,
  BaseMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { StructuredTool } from "@langchain/core/tools";
import { CommonService } from "@libs/modules/common/common.service";
import { createLogIncidentTool } from "./tools/log-Incident.tool";
import { createSaveSentimentTool } from "./tools/save-sentiment.tool";
import { createGetIncidentsByDateRangeTool } from "./tools/get-incidents-by-date-range.tool";

/**
 * QA specialist agent. Invoked by the orchestrator via TCP (agent.chat).
 * Processes product questions, FAQs, and quality feedback. Responds back to the
 * orchestrator with a string reply (no routing tools).
 */
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly llm: ChatOpenAI;
  private readonly agentWithTools: any;
  private readonly prompt: ChatPromptTemplate;
  private readonly tools: Record<string, StructuredTool>;

  constructor(
    private memoryService: MemoryService,
    private readonly commonService: CommonService,
    @Inject("INCIDENT_SERVICE")
    private readonly incidentClient: ClientProxy,
    @Inject("USER_SERVICE")
    private readonly userClient: ClientProxy,
  ) {
    this.tools = {
      log_incident: createLogIncidentTool(
        this.commonService,
        this.incidentClient,
      ),
      save_sentiment: createSaveSentimentTool(
        this.commonService,
        this.userClient,
      ),
      get_incidents_by_date_range: createGetIncidentsByDateRangeTool(
        this.commonService,
        this.incidentClient,
      ),
    } as Record<string, StructuredTool>;

    this.llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
    });
    this.agentWithTools = this.llm.bindTools(Object.values(this.tools));

    const systemPrompt = `You are the QA Agent for OneDelivery. You serve three roles:

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

        ## ROLE 3: TREND ANALYSIS
        When you receive a message starting with "Please analyze trends in the month", you will analyze the incident trends for the month using the get_incidents_by_date_range tool. Provide insights on the most common incident types and analyze any notable patterns.
        - Always use the get_incidents_by_date_range tool to fetch the data for analysis, do not make up numbers
        - Based on the data, return a structured JSON trend analysis with:
          - totalByThisMonth (number)
          - mostCommon (the incident type with highest count)
          - percentage (percentage of this incident type among all incidents)
          - trend ("up", "down", "stable", "NA" compared to last month. Give "NA" if last month's data is not available for comparison)
          - peakTime (the time range that occurred most frequently, e.g. "18:00-20:00")
          - issues (based on the summaries of the incidents, give up to 3 item of array of the most common issues or patterns you find, e.g. ["late deliveries due to traffic", "payment failures on mobile app", "missing items from a specific restaurant"])
        - avoid making up patterns that are not supported by the data, if the data does not show any clear pattern, just say "No clear patterns identified from the data."
        - Issues should be based on the summaries of the incidents, look for common keywords or themes in the summaries to identify issues. Do not make up issues that are not supported by the data.
        - if the data is insufficient to give "issues" insights in the JSON, just give empty array for issues.
        - if the data is insufficient to determine trend compared to last month, set trend to "NA".
        - if you cannot determine peakTime from the data, set peakTime to "NA".
        - Must ALWAYS return the analysis in a JSON format as described above, do not return in any other format.
        - Return only the JSON, do not include any additional text or explanation outside of the JSON. The JSON should be the direct response to the user's request for trend analysis.

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

    const response = (await this.agentWithTools.invoke(
      formatted,
    )) as BaseMessage;
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
    const response = (await this.agentWithTools.invoke(
      formattedReview,
    )) as AIMessage;

    let incidentLogged = false;

    // Handle tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        if (toolCall.name === "log_incident") {
          try {
            const result = await this.tools["log_incident"].invoke(
              toolCall.args as any,
            );
            this.logger.log(
              `Logged incident for session ${sessionId}: ${result}`,
            );
            incidentLogged = true;
          } catch (error) {
            this.logger.error(
              `Failed to log incident for session ${sessionId}: ${error.message}`,
            );
          }
        } else if (toolCall.name === "save_sentiment") {
          try {
            const result = await this.tools["save_sentiment"].invoke({
              ...toolCall.args,
              sessionId,
            } as any);
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

  /**
   * Analyze this month's incident trends using the get_incidents_by_date_range tool.
   * Called by the qa.analyzeTrends MessagePattern (triggered from the incident service).
   */
  async analyzeTrends(): Promise<any> {
    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const endDate = now.toISOString();

    this.logger.log(`Analyzing trends from ${startDate} to ${endDate}`);

    const userPrompt = `Please analyze trends in the month's incident data from ${startDate} to ${endDate}.`;

    const formatted = await this.prompt.formatMessages({
      chat_history: [],
      input: userPrompt,
    });

    const firstResponse = (await this.agentWithTools.invoke(
      formatted,
    )) as AIMessage;

    if (firstResponse.tool_calls && firstResponse.tool_calls.length > 0) {
      const toolMessages: ToolMessage[] = [];
      for (const toolCall of firstResponse.tool_calls) {
        const calledTool = this.tools[toolCall.name];
        if (calledTool) {
          const result = await calledTool.invoke(toolCall.args as any);
          toolMessages.push(
            new ToolMessage({
              content: result,
              tool_call_id: toolCall.id ?? "",
            }),
          );
        }
      }

      // Force the model to generate the JSON now that it has data
      const finalResponse = (await this.agentWithTools.invoke([
        ...formatted,
        firstResponse,
        ...toolMessages,
        new HumanMessage(
          "Now provide the structured JSON trend analysis based on the data above.",
        ),
      ])) as AIMessage;

      this.logger.log(
        `Final response after tool calls: ${finalResponse.content}`,
      );

      const content =
        typeof finalResponse.content === "string"
          ? finalResponse.content
          : JSON.stringify(finalResponse.content);

      // Extract JSON from markdown code block or raw object
      const jsonMatch = content.match(
        /```(?:json)?\n?([\s\S]*?)```|({[\s\S]*})/,
      );
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1] ?? jsonMatch[2]);
        } catch (_) {}
      }
      return { analysis: content };
    }

    const content =
      typeof firstResponse.content === "string"
        ? firstResponse.content
        : JSON.stringify(firstResponse.content);
    return { analysis: content };
  }
}
