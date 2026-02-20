import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditEvent } from './entities/audit-event.entity';
import { Incident } from './entities/incident.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
      schema: 'audit',
      entities: [AuditEvent, Incident],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([AuditEvent, Incident]),
  ],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AppModule {}
