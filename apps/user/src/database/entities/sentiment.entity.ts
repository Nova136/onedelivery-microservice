import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
    Index,
    Relation,
} from "typeorm";
import { ChatSession } from "./chat-session.entity";

export type TrendType = "improving" | "declining" | "stable";

@Entity({ name: "sentiment", schema: "users" })
@Index("idx_sentiment_session_id", ["sessionId"], { unique: true })
@Index("idx_sentiment_overall_score", ["overallScore"])
@Index("idx_sentiment_should_escalate", ["shouldEscalate"])
@Index("idx_sentiment_trend", ["trend"])
export class Sentiment {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    // Foreign Key to ChatSession (ONE sentiment per session)
    @OneToOne(() => ChatSession, { onDelete: "CASCADE", nullable: false })
    @JoinColumn({ name: "session_id" })
    session: Relation<ChatSession>;

    @Column({ name: "session_id", type: "uuid" })
    sessionId: string;

    // Session-level Summary Scores
    // Sentiment Analysis Results
    @Column({ type: "numeric", precision: 3, scale: 2 })
    overallScore: number; // -1.00 to 1.00 (average of all messages in session)

    @Column({ type: "varchar", length: 20, nullable: true })
    trend: TrendType | null; // improving, declining, stable

    // Escalation Info
    @Column({ type: "boolean", default: false })
    shouldEscalate: boolean;

    @Column({ type: "varchar", length: 255, nullable: true })
    escalationReason: string | null;

    // Metadata
    @Column({ type: "varchar", length: 50, default: "GPT-4O" })
    analyzedBy: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
