import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MemoryService } from "./memory.service";
import { ChatMessage } from "../database/entities/chat-message.entity";
import { ChatSession } from "../database/entities/chat-session.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage, ChatSession])],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}