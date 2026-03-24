import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";
import { ClientProxy } from "@nestjs/microservices";
import { Incident } from "./database/entities/incidents.entity";
import { CommonService } from "@libs/modules/common/common.service";

@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
    private readonly commonService: CommonService,
    @Inject("QA_AGENT_SERVICE")
    private readonly qaAgentClient: ClientProxy,
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
    this.logger.log("Delegating trend analysis to QA agent...");
    return this.commonService.sendViaRMQ(
      this.qaAgentClient,
      { cmd: "qa.analyzeTrends" },
      {},
    );
  }
}
