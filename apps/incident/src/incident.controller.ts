import { Body, Controller, Post } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IncidentService } from './incident.service';
import { ApiProperty } from '@nestjs/swagger';
import { LogIncidentDto } from './dto/LogIncidentDto';


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

  @Post('/log-incidents')
  @ApiOperation({ summary: 'Log a new incident via REST' })
  async createIncident(@Body() data: LogIncidentDto) {
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
}
