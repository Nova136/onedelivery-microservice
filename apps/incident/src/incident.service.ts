import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";
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
    this.logger.log(
      `logIncident received: "${type}, ${summary}, ${orderId}, ${userId}"`,
    );

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

  async getIncidentByDateRange(startDate: Date, endDate: Date) {
    return this.incidentRepo.find({
      where: {
        createdAt: Between(startDate, endDate),
      },
      order: {
        createdAt: "DESC",
      },
    });
  }

  async analyzeTrends() {
    const trendAnalysisData = {
      summary: {
        totalByThisMonth: 45,
        mostCommon: "MISSING_ITEMS",
        percentage: 60,
        trend: "+15% vs previous month",
        peakTime: "6-8 PM",
        issues: ["Food items missing from orders", "Delivery delays"],
      }
    };
    return trendAnalysisData;
  }
}
