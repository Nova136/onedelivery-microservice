import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from "typeorm";
import { ChatSession } from "./chat-session.entity";

export type ChatMessageType = "human" | "ai" | "tool" | "unknown";

@Entity({ name: "chat_message", schema: "users" })
@Index(["userId", "sessionId"])
export class ChatMessage {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255 })
    userId: string;

    @ManyToOne(() => ChatSession, { onDelete: "CASCADE" })
    @JoinColumn({ name: "sessionId" })
    sessionId: ChatSession;

    @Column({ type: "varchar", length: 32 })
    type: ChatMessageType;

    @Column({ type: "text" })
    content: string;

    @Column({ type: "varchar", length: 512, nullable: true })
    toolCallId: string | null;

    @Column({ type: "int", default: 0 })
    sequence: number;

    @CreateDateColumn()
    createdAt: Date;
}
