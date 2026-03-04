import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MemoryService } from "./memory.service";
import { ChatMessage } from "../database/entities/chat-message.entity";

@Module({
    imports: [TypeOrmModule.forFeature([ChatMessage])],
    providers: [MemoryService],
    exports: [MemoryService],
})
export class MemoryModule {}
