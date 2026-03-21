import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { CommonService } from "@libs/modules/common/common.service";

interface ChatMessageDTO {
  type: "human" | "ai" | "tool" | "unknown";
  content: string;
  toolCallId?: string;
  sequence: number;
}

interface ChatSessionDTO {
  messages: ChatMessageDTO[];
}

@Injectable()
export class MemoryService {
  constructor(
    @Inject("USER_SERVICE")
    private readonly userClient: ClientProxy,
    private readonly commonService: CommonService,
  ) {}

  async getHistory(userId: string, sessionId: string): Promise<BaseMessage[]> {
    const result = await this.commonService.sendViaRMQ<ChatSessionDTO>(
      this.userClient,
      { cmd: "user.chat.getHistory" },
      { userId, sessionId },
    );
    return (result?.messages ?? []).map((msg) => {
      switch (msg.type) {
        case "human": return new HumanMessage(msg.content);
        case "ai": return new AIMessage(msg.content);
        case "tool": return new ToolMessage({ content: msg.content, tool_call_id: msg.toolCallId ?? "" });
        default: return new HumanMessage(msg.content);
      }
    });
  }

  async saveHistory(
    userId: string,
    sessionId: string,
    messages: BaseMessage[],
  ): Promise<void> {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const type = msg instanceof HumanMessage ? "human"
        : msg instanceof AIMessage ? "ai"
        : msg instanceof ToolMessage ? "tool"
        : "unknown";
      await this.commonService.sendViaRMQ<void>(
        this.userClient,
        { cmd: "user.chat.saveHistory" },
        {
          userId,
          sessionId,
          message: {
            type,
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
            toolCallId: (msg as any).tool_call_id ?? null,
            sequence: i,
          },
        },
      );
    }
  }
}