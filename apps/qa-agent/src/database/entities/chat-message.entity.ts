import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ChatMessageType = 'human' | 'ai' | 'tool' | 'unknown';

@Entity({ name: 'chat_message', schema: 'orchestrator' })
@Index(['userId', 'sessionId'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  sessionId: string;

  @Column({ type: 'varchar', length: 32 })
  type: ChatMessageType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  toolCallId: string | null;

  @Column({ type: 'int', default: 0 })
  sequence: number;

  @Column({ default: false })
  reviewed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
