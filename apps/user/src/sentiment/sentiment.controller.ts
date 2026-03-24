import { Controller, Logger, Post } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { SentimentService, SentimentAnalysisRequest, SentimentResponse } from "./sentiment.service";
import { ApiOperation } from "@nestjs/swagger";

@Controller()
export class SentimentController {
  private readonly logger = new Logger(SentimentController.name);

  constructor(private readonly sentimentService: SentimentService) {}

  /**
   * Save or update session-level sentiment
   * Called by QA Agent via RabbitMQ when session ends
   */
  @Post('/saveSentiment')
  @ApiOperation({ summary: 'Save or update session-level sentiment' })
  @MessagePattern({ cmd: "user.sentiment.save" })
  async saveSessionSentiment(
    @Payload() payload: SentimentAnalysisRequest,
  ): Promise<SentimentResponse> {
    this.logger.log(
      `Received sentiment analysis request for session: ${payload.sessionId}`
    );
    return await this.sentimentService.saveSessionSentiment(payload);
  }

  /**
   * Get sentiment for a specific session
   */
  @MessagePattern({ cmd: "user.sentiment.getBySessionId" })
  async getSentimentBySessionId(@Payload() payload: { sessionId: string }) {
    return await this.sentimentService.getSentimentBySessionId(payload.sessionId);
  }

  /**
   * Get all sessions flagged for escalation (for monitoring/dashboards)
   */
  @MessagePattern({ cmd: "user.sentiment.getEscalated" })
  async getEscalatedSessions(@Payload() payload: { limit?: number }) {
    return await this.sentimentService.getEscalatedSessions(payload.limit || 20);
  }
}