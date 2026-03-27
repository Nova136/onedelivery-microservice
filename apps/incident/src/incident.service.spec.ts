import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IncidentService } from './incident.service';
import { Incident } from './database/entities/incidents.entity';
import { CommonService } from '@libs/modules/common/common.service';

describe('IncidentService', () => {
  let service: IncidentService;

  const mockIncidentRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
  };

  const mockQaAgentClient = {};
  const mockCommonService = {
    sendViaRMQ: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentService,
        { provide: getRepositoryToken(Incident), useValue: mockIncidentRepo },
        { provide: 'QA_AGENT_SERVICE', useValue: mockQaAgentClient },
        { provide: CommonService, useValue: mockCommonService },
      ],
    }).compile();

    service = module.get<IncidentService>(IncidentService);
    jest.clearAllMocks();
  });

  describe('logIncident', () => {
    it('should create and save an incident with all fields', async () => {
      const now = new Date();
      const incident = {
        id: 'inc-1',
        type: 'PAYMENT_FAILED',
        summary: 'Payment could not be completed',
        orderId: 'order-1',
        userId: 'user-1',
        createdAt: now,
      };
      mockIncidentRepo.create.mockReturnValue(incident);
      mockIncidentRepo.save.mockResolvedValue(incident);

      const result = await service.logIncident('PAYMENT_FAILED', 'Payment could not be completed', 'order-1', 'user-1');

      expect(mockIncidentRepo.create).toHaveBeenCalledWith({
        type: 'PAYMENT_FAILED',
        summary: 'Payment could not be completed',
        orderId: 'order-1',
        userId: 'user-1',
      });
      expect(mockIncidentRepo.save).toHaveBeenCalledWith(incident);
      expect(result).toEqual(incident);
    });

    it('should default orderId and userId to null when not provided', async () => {
      const incident = { id: 'inc-2', type: 'SYSTEM_ERROR', summary: 'Error', orderId: null, userId: null };
      mockIncidentRepo.create.mockReturnValue(incident);
      mockIncidentRepo.save.mockResolvedValue(incident);

      await service.logIncident('SYSTEM_ERROR', 'Error');

      expect(mockIncidentRepo.create).toHaveBeenCalledWith({
        type: 'SYSTEM_ERROR',
        summary: 'Error',
        orderId: null,
        userId: null,
      });
    });
  });

  describe('getIncidents', () => {
    it('should return paginated incidents', async () => {
      const incidents = [{ id: 'inc-1' }, { id: 'inc-2' }] as Incident[];
      mockIncidentRepo.findAndCount.mockResolvedValue([incidents, 2]);

      const result = await service.getIncidents(1, 10);

      expect(mockIncidentRepo.findAndCount).toHaveBeenCalledWith({ skip: 0, take: 10 });
      expect(result).toEqual(incidents);
    });

    it('should use default page 1 and limit 10', async () => {
      mockIncidentRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getIncidents();

      expect(mockIncidentRepo.findAndCount).toHaveBeenCalledWith({ skip: 0, take: 10 });
    });

    it('should calculate correct skip for page 3', async () => {
      mockIncidentRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getIncidents(3, 5);

      expect(mockIncidentRepo.findAndCount).toHaveBeenCalledWith({ skip: 10, take: 5 });
    });
  });

  describe('getIncidentByDateRange', () => {
    it('should return incidents between startDate and endDate', async () => {
      const incidents = [{ id: 'inc-1' }] as Incident[];
      mockIncidentRepo.find.mockResolvedValue(incidents);

      const start = new Date('2024-01-01');
      const end = new Date('2024-12-31');
      const result = await service.getIncidentByDateRange(start, end);

      expect(mockIncidentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
      expect(result).toEqual(incidents);
    });
  });

  describe('analyzeTrends', () => {
    it('should delegate to QA agent via RMQ', async () => {
      const trendResult = { trends: [] };
      mockCommonService.sendViaRMQ.mockResolvedValue(trendResult);

      const result = await service.analyzeTrends();

      expect(mockCommonService.sendViaRMQ).toHaveBeenCalledWith(
        mockQaAgentClient,
        { cmd: 'qa.analyzeTrends' },
        {},
      );
      expect(result).toEqual(trendResult);
    });
  });
});
