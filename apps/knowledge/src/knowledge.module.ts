import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faq } from './database/entities/faq.entity';
import { Sop } from './database/entities/sop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Faq, Sop])],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
})
export class KnowledgeModule {}
