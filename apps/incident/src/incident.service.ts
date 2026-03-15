import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Incident } from "./database/entities/incidents.entity";

@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
  ) {}

  async logIncident(
    type: string,
    summary: string,
    orderId?: string,
    userId?: string,
  ) {
    this.logger.log(`logIncident received: "${type}, ${summary}, ${orderId}, ${userId}"`);

    const incident = this.incidentRepo.create({
      type,
      summary,
      orderId: orderId ?? null,
      userId: userId ?? null,
    });
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
