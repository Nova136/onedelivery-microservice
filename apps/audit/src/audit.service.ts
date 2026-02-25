import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { Incident } from './entities/incident.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
  ) {}

  async logEvent(action: string, entityType: string, entityId: string, userId?: string, metadata?: Record<string, unknown>) {
    const event = this.auditRepo.create({
      action,
      entityType,
      entityId,
      userId: userId ?? null,
      metadata: metadata ?? null,
    });
    return this.auditRepo.save(event);
  }

  async query(entityType?: string, entityId?: string, from?: string, to?: string) {
    const qb = this.auditRepo.createQueryBuilder('e').orderBy('e.createdAt', 'DESC');
    if (entityType) qb.andWhere('e.entityType = :entityType', { entityType });
    if (entityId) qb.andWhere('e.entityId = :entityId', { entityId });
    if (from && to) qb.andWhere('e.createdAt BETWEEN :from AND :to', { from, to: to });
    return qb.getMany();
  }

  async findPaginated(page: number, limit: number) {
    const safePage = page > 0 ? page : 1;
    const safeLimit = limit > 0 ? limit : 20;
    const qb = this.auditRepo
      .createQueryBuilder('e')
      .orderBy('e.createdAt', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);

    const [data, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / safeLimit) || 1;

    return {
      data,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    };
  }

  async logIncident(type: string, summary: string, orderId?: string) {
    const incident = this.incidentRepo.create({ type, summary, orderId: orderId ?? null });
    return this.incidentRepo.save(incident);
  }
}
