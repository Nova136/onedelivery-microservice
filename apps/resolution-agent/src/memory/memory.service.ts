import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { CommonService } from "@libs/modules/common/common.service";

@Injectable()
export class MemoryService {
  constructor(
    @Inject("USER_SERVICE")
    private readonly userClient: ClientProxy,
    private readonly commonService: CommonService,
  ) {}

  async getHistory(userId: string, sessionId: string): Promise<BaseMessage[]> {
    return this.commonService.sendViaRMQ<BaseMessage[]>(
      this.userClient,
      { cmd: "user.chat.getHistory" },
      { userId, sessionId },
    );
  }

  async saveHistory(
    userId: string,
    sessionId: string,
    messages: BaseMessage[],
  ): Promise<void> {
    await this.commonService.sendViaRMQ<void>(
      this.userClient,
      { cmd: "user.chat.saveHistory" },
      { userId, sessionId, messages },
    );
  }
}