import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    OneToOne,
    JoinColumn,
    Relation,
} from "typeorm";
import { ChatMessage } from "./chat-message.entity";
import { Sentiment } from "./sentiment.entity";
export type ChatStatus = "OPEN" | "CLOSED";

@Entity({ name: "chat_session", schema: "users" })
export class ChatSession {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255 })
    userId: string;

    @Column({ type: "varchar", length: 50 })
    status: string;

    @Column({ type: "boolean", default: false })
    reviewed: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => ChatMessage, (message) => message.sessionId)
    messages: Relation<ChatMessage[]>;

    // Store summary of the conversation
    @Column({ type: "text", nullable: true })
    summary: string | null;

    // Store the sequence number of the last message included in the summary
    @Column({ type: "int", default: 0 })
    lastSummarizedSequence: number;

    // NEW: FK to Sentiment (optional)
    @OneToOne(() => Sentiment, { nullable: true, eager: false })
    @JoinColumn({ name: "sentiment_id" })
    sentiment: Relation<Sentiment> | null;
}
