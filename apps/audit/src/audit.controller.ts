import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuditService } from './audit.service';

export interface LogEventDto {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface QueryAuditDto {
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @MessagePattern({ cmd: 'audit.log' })
  async logEvent(@Payload() data: LogEventDto) {
    const event = await this.auditService.logEvent(
      data.action,
      data.entityType,
      data.entityId,
      data.userId,
      data.metadata,
    );
    return {
      auditId: event.id,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      timestamp: event.createdAt.toISOString(),
      message: 'Audit microservice: event logged',
    };
  }

  @MessagePattern({ cmd: 'audit.query' })
  async queryAudit(@Payload() data: QueryAuditDto) {
    const events = await this.auditService.query(
      data.entityType,
      data.entityId,
      data.from,
      data.to,
    );
    return {
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        userId: e.userId,
        createdAt: e.createdAt.toISOString(),
      })),
      message: 'Audit microservice: audit trail returned',
    };
  }

  @MessagePattern({ cmd: 'audit.incident' })
  async logIncident(@Payload() data: { type: string; orderId?: string; summary: string }) {
    const incident = await this.auditService.logIncident(
      data.type,
      data.summary,
      data.orderId,
    );
    return {
      incidentId: incident.id,
      type: incident.type,
      summary: incident.summary,
      timestamp: incident.createdAt.toISOString(),
      message: 'Audit microservice: incident logged',
    };
  }
}
