import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from './entities/incidents.entity';

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
}
