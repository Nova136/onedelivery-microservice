import { Test, TestingModule } from '@nestjs/testing';
import { IncidentController } from './incident.controller';
import { IncidentService } from './incident.service';
import { LogIncidentDto } from './dto/LogIncidentDto';

describe('IncidentController', () => {
  let controller: IncidentController;

  const mockIncidentService = {
    logIncident: jest.fn(),
    getIncidents: jest.fn(),
    analyzeTrends: jest.fn(),
    getIncidentByDateRange: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncidentController],
      providers: [{ provide: IncidentService, useValue: mockIncidentService }],
    }).compile();

    controller = module.get<IncidentController>(IncidentController);
    jest.clearAllMocks();
  });

  describe('logIncident', () => {
    it('should log an incident and return formatted response', async () => {
      const now = new Date();
      const incident = { id: 'inc-1', type: 'PAYMENT_FAILED', summary: 'Payment failed', createdAt: now };
      mockIncidentService.logIncident.mockResolvedValue(incident);

      const dto: LogIncidentDto = { type: 'PAYMENT_FAILED', summary: 'Payment failed' };
      const result = await controller.logIncident(dto);

      expect(mockIncidentService.logIncident).toHaveBeenCalledWith(
        'PAYMENT_FAILED',
        'Payment failed',
        undefined,
        undefined,
      );
      expect(result).toEqual({
        incidentId: 'inc-1',
        type: 'PAYMENT_FAILED',
        summary: 'Payment failed',
        timestamp: now.toISOString(),
        message: 'Incident microservice: incident logged',
      });
    });
  });

  describe('logIncidentLegacy', () => {
    it('should delegate to logIncident', async () => {
      const now = new Date();
      const incident = { id: 'inc-2', type: 'SYSTEM_ERROR', summary: 'Err', createdAt: now };
      mockIncidentService.logIncident.mockResolvedValue(incident);

      const dto: LogIncidentDto = { type: 'SYSTEM_ERROR', summary: 'Err' };
      const result = await controller.logIncidentLegacy(dto);

      expect(mockIncidentService.logIncident).toHaveBeenCalledTimes(1);
      expect((result as any).incidentId).toBe('inc-2');
    });
  });

  describe('getIncidents', () => {
    it('should return all incidents', async () => {
      const incidents = [{ id: 'inc-1' }, { id: 'inc-2' }];
      mockIncidentService.getIncidents.mockResolvedValue(incidents);

      const result = await controller.getIncidents();

      expect(result).toEqual({ incidents });
    });
  });

  describe('trendAnalysis', () => {
    it('should return trend analysis from QA agent', async () => {
      const trends = { summary: 'stable' };
      mockIncidentService.analyzeTrends.mockResolvedValue(trends);

      const result = await controller.trendAnalysis();

      expect(result).toEqual(trends);
    });
  });

  describe('getIncidentsByDateRange', () => {
    it('should return incidents within the given date range', async () => {
      const incidents = [{ id: 'inc-1' }];
      mockIncidentService.getIncidentByDateRange.mockResolvedValue(incidents);

      const result = await controller.getIncidentsByDateRange({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(mockIncidentService.getIncidentByDateRange).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-12-31'),
      );
      expect(result).toEqual({ incidents });
    });
  });
});
