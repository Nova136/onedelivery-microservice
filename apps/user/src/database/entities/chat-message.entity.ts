import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Relation,
} from "typeorm";
import { ChatSession } from "./chat-session.entity";

export type ChatMessageType =
    | "human"
    | "ai"
    | "tool"
    | "system"
    | "admin"
    | "unknown";

@Entity({ name: "chat_message", schema: "users" })
export class ChatMessage {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => ChatSession, { onDelete: "CASCADE" })
    @JoinColumn({ name: "sessionId" })
    sessionId: Relation<ChatSession>;

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
