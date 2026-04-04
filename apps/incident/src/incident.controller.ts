import { Body, Controller, Get, Post } from '@nestjs/common';
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
      data.userId,
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

  @MessagePattern({ cmd: 'log-incidents' })
  // @Post('/log-incidents')
  @ApiOperation({ summary: 'Log a new incident via REST' })
  async createIncident(@Payload() data: LogIncidentDto) {
    const incident = await this.incidentService.logIncident(
      data.type,
      data.summary,
      data.orderId,
      data.userId,
    );
    return {
      incidentId: incident.id,
      type: incident.type,
      summary: incident.summary,
      timestamp: incident.createdAt.toISOString(),
      message: 'Incident microservice: incident logged',
    };
  }

  @Get('')
  @ApiOperation({ summary: 'Get all incidents via REST' })
  async getIncidents() {
    const incident = await this.incidentService.getIncidents();
    return { incidents: incident };
  }

  @Get('/trends')
  @ApiOperation({ summary: 'Get incident trends via REST' })
  async trendAnalysis() {
    const trendAnalysis = await this.incidentService.analyzeTrends();
    return trendAnalysis;
  }
  
  @MessagePattern({ cmd: 'incident.getByDateRange' })
  @ApiOperation({ summary: 'Get incidents by date range via REST' })
  async getIncidentsByDateRange(@Payload() data: { startDate: string; endDate: string }) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const incidents = await this.incidentService.getIncidentByDateRange(startDate, endDate);
    return { incidents };
  }

  
}
