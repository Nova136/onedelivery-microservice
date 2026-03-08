import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from './database/entities/incidents.entity';

@Injectable()
export class IncidentService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
  ) {}

  async logIncident(type: string, summary: string, orderId?: string) {
    const incident = this.incidentRepo.create({ type, summary, orderId: orderId ?? null });
    return this.incidentRepo.save(incident);
  }

  async getIncidents(page: number = 1, limit: number = 10) {
    const [incidents, total] = await this.incidentRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
    });
    return incidents;
  }
}
