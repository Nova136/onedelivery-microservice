import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Sentiment, TrendType } from "../database/entities/sentiment.entity";
import { ChatMessage } from "../database/entities/chat-message.entity";
import { ChatSession } from "../database/entities/chat-session.entity";
import { ApiProperty } from "@nestjs/swagger";

export class SentimentAnalysisRequest {
  @ApiProperty({ 
    example: 'Customer reported fries were missing from the bag.', 
    description: 'A detailed description of the support request' 
  })
  sessionId: string;
  overallScore: number;  // Average sentiment across all messages
  trend?: TrendType;     // improving, declining, stable (optional)
  shouldEscalate: boolean;
  escalationReason?: string;
}

export interface SentimentResponse {
  id: string;
  sessionId: string;
  overallScore: number;
  trend: TrendType;
  shouldEscalate: boolean;
  createdAt: Date;
}

@Injectable()
export class SentimentService {
  private readonly logger = new Logger(SentimentService.name);

  constructor(
    @InjectRepository(Sentiment)
    private readonly sentimentRepo: Repository<Sentiment>,
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
  ) {}

  /**
   * Save or update session-level sentiment
   * One sentiment record per chat session
   */
  async saveSessionSentiment(
    request: SentimentAnalysisRequest,
  ): Promise<SentimentResponse> {
    this.logger.log(
      `Saving session sentiment for session ${request.sessionId}: overall=${request.overallScore.toFixed(2)}, trend=${request.trend}`
    );

    // Check session exists
    const session = await this.sessionRepo.findOne({
      where: { id: request.sessionId },
    });

    if (!session) {
      throw new Error(`Chat session not found: ${request.sessionId}`);
    }

    // Try to find existing sentiment for this session
    let sentiment = await this.sentimentRepo.findOne({
      where: { sessionId: request.sessionId },
    });

    if (sentiment) {
      // Update existing
      sentiment.overallScore = request.overallScore;
      sentiment.trend = request.trend ?? null;
      sentiment.shouldEscalate = request.shouldEscalate;
      sentiment.escalationReason = request.escalationReason || null;
    } else {
      // Create new
      sentiment = this.sentimentRepo.create({
        sessionId: request.sessionId,
        overallScore: request.overallScore,
        trend: request.trend ?? null,
        shouldEscalate: request.shouldEscalate,
        escalationReason: request.escalationReason || null,
      });
    }

    const saved = await this.sentimentRepo.save(sentiment);
    this.logger.log(`Session sentiment saved: ${saved.id}`);

    try {
        // Update ChatSession with FK to Sentiment
        session.sentiment = saved;
        await this.sessionRepo.save(session);
        this.logger.log(`ChatSession ${session.id} updated with sentiment ${saved.id}`);
    } catch (error) {
        this.logger.error(`Failed to update ChatSession ${session.id} with sentiment ${saved.id}: ${error.message}`);

    }

    return {
      id: saved.id,
      sessionId: saved.sessionId,
      overallScore: saved.overallScore,
      trend: saved.trend,
      shouldEscalate: saved.shouldEscalate,
      createdAt: saved.createdAt,
    };
  }

  /**
   * Get sentiment for a specific session
   */
  async getSentimentBySessionId(sessionId: string): Promise<Sentiment | null> {
    return this.sentimentRepo.findOne({
      where: { sessionId },
      relations: ["session"],
    });
  }

  /**
   * Get all escalated sessions (for monitoring/dashboards)
   */
  async getEscalatedSessions(
    limit: number = 20,
  ): Promise<Array<{ sentiment: Sentiment; session: ChatSession }>> {
    const results = await this.sentimentRepo.find({
      where: { shouldEscalate: true },
      relations: ["session"],
      order: { createdAt: "DESC" },
      take: limit,
    });
    return results.map((r) => ({ sentiment: r, session: r.session }));
  }
}