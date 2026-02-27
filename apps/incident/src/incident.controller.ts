import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import { IncidentService } from './incident.service';

export interface LogIncidentDto {
  type: string;
  summary: string;
  orderId?: string;
}

@ApiTags('Incident')
@Controller()
export class IncidentController {
  constructor(private readonly incidentService: IncidentService) {}

  @MessagePattern({ cmd: 'incident.log' })
  async logIncident(@Payload() data: LogIncidentDto) {
    const incident = await this.incidentService.logIncident(
      data.type,
      data.summary,
      data.orderId,
    );
    return {
      incidentId: incident.id,
      type: incident.type,
      summary: incident.summary,
      timestamp: incident.createdAt.toISOString(),
      message: 'Incident microservice: incident logged',
    };
  }

  /** Backward compatibility: same as incident.log */
  @MessagePattern({ cmd: 'audit.incident' })
  async logIncidentLegacy(@Payload() data: LogIncidentDto) {
    return this.logIncident(data);
  }
}
