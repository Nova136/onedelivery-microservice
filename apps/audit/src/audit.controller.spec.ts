import { Test, TestingModule } from '@nestjs/testing';
import { AuditController, LogEventDto, QueryAuditDto } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditEvent } from './database/entities/audit-event.entity';

describe('AuditController', () => {
  let controller: AuditController;

  const mockAuditService = {
    logEvent: jest.fn(),
    query: jest.fn(),
    findPaginated: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);

    jest.clearAllMocks();
  });

  describe('logEvent', () => {
    it('should call auditService.logEvent with correct arguments', async () => {
      const now = new Date();
      const savedEvent: AuditEvent = {
        id: 'uuid-1',
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: 'order-123',
        userId: 'user-456',
        metadata: { amount: 50 },
        createdAt: now,
      };

      mockAuditService.logEvent.mockResolvedValue(savedEvent);

      const dto: LogEventDto = {
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: 'order-123',
        userId: 'user-456',
        metadata: { amount: 50 },
      };

      await controller.logEvent(dto);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        'ORDER_CREATED',
        'Order',
        'order-123',
        'user-456',
        { amount: 50 },
      );
    });

    it('should return a formatted response with auditId and timestamp', async () => {
      const now = new Date();
      const savedEvent: AuditEvent = {
        id: 'uuid-1',
        action: 'PAYMENT_PROCESSED',
        entityType: 'Payment',
        entityId: 'pay-789',
        userId: 'user-001',
        metadata: null,
        createdAt: now,
      };

      mockAuditService.logEvent.mockResolvedValue(savedEvent);

      const result = await controller.logEvent({
        action: 'PAYMENT_PROCESSED',
        entityType: 'Payment',
        entityId: 'pay-789',
        userId: 'user-001',
      });

      expect(result).toEqual({
        auditId: 'uuid-1',
        action: 'PAYMENT_PROCESSED',
        entityType: 'Payment',
        entityId: 'pay-789',
        timestamp: now.toISOString(),
        message: 'Audit microservice: event logged',
      });
    });

    it('should handle events without userId', async () => {
      const now = new Date();
      const savedEvent: AuditEvent = {
        id: 'uuid-2',
        action: 'SYSTEM_INIT',
        entityType: 'System',
        entityId: 'bootstrap',
        userId: null,
        metadata: null,
        createdAt: now,
      };

      mockAuditService.logEvent.mockResolvedValue(savedEvent);

      const result = await controller.logEvent({
        action: 'SYSTEM_INIT',
        entityType: 'System',
        entityId: 'bootstrap',
      });

      expect(result.auditId).toBe('uuid-2');
      expect(result.message).toBe('Audit microservice: event logged');
    });
  });

  describe('queryAudit', () => {
    it('should call auditService.query with all filters', async () => {
      mockAuditService.query.mockResolvedValue([]);

      const dto: QueryAuditDto = {
        entityType: 'Order',
        entityId: 'order-123',
        from: '2024-01-01',
        to: '2024-12-31',
      };

      await controller.queryAudit(dto);

      expect(mockAuditService.query).toHaveBeenCalledWith(
        'Order',
        'order-123',
        '2024-01-01',
        '2024-12-31',
      );
    });

    it('should return formatted events array', async () => {
      const now = new Date();
      const events: AuditEvent[] = [
        {
          id: 'uuid-1',
          action: 'ORDER_CREATED',
          entityType: 'Order',
          entityId: 'order-123',
          userId: 'user-456',
          metadata: null,
          createdAt: now,
        },
        {
          id: 'uuid-2',
          action: 'ORDER_UPDATED',
          entityType: 'Order',
          entityId: 'order-123',
          userId: null,
          metadata: null,
          createdAt: now,
        },
      ];

      mockAuditService.query.mockResolvedValue(events);

      const result = await controller.queryAudit({ entityType: 'Order' });

      expect(result).toEqual({
        events: [
          {
            id: 'uuid-1',
            action: 'ORDER_CREATED',
            entityType: 'Order',
            entityId: 'order-123',
            userId: 'user-456',
            createdAt: now.toISOString(),
          },
          {
            id: 'uuid-2',
            action: 'ORDER_UPDATED',
            entityType: 'Order',
            entityId: 'order-123',
            userId: null,
            createdAt: now.toISOString(),
          },
        ],
        message: 'Audit microservice: audit trail returned',
      });
    });

    it('should return empty events array when no results', async () => {
      mockAuditService.query.mockResolvedValue([]);

      const result = await controller.queryAudit({});

      expect(result).toEqual({
        events: [],
        message: 'Audit microservice: audit trail returned',
      });
    });

    it('should handle query with no filters', async () => {
      mockAuditService.query.mockResolvedValue([]);

      await controller.queryAudit({});

      expect(mockAuditService.query).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('listAuditLogs', () => {
    it('should return paginated audit logs with correct structure', async () => {
      const now = new Date();
      const paginatedResult = {
        data: [
          {
            id: 'uuid-1',
            action: 'ORDER_CREATED',
            entityType: 'Order',
            entityId: 'order-123',
            userId: 'user-456',
            createdAt: now,
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      };

      mockAuditService.findPaginated.mockResolvedValue(paginatedResult);

      const result = await controller.listAuditLogs(1, 20);

      expect(mockAuditService.findPaginated).toHaveBeenCalledWith(1, 20);
      expect(result).toEqual({
        data: [
          {
            id: 'uuid-1',
            action: 'ORDER_CREATED',
            entityType: 'Order',
            entityId: 'order-123',
            userId: 'user-456',
            createdAt: now.toISOString(),
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should pass custom page and limit to the service', async () => {
      mockAuditService.findPaginated.mockResolvedValue({
        data: [],
        page: 3,
        limit: 5,
        total: 15,
        totalPages: 3,
      });

      await controller.listAuditLogs(3, 5);

      expect(mockAuditService.findPaginated).toHaveBeenCalledWith(3, 5);
    });

    it('should return empty data array with correct pagination metadata', async () => {
      mockAuditService.findPaginated.mockResolvedValue({
        data: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
      });

      const result = await controller.listAuditLogs(1, 20);

      expect(result.data).toEqual([]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
      });
    });

    it('should convert createdAt to ISO string for each log entry', async () => {
      const date1 = new Date('2024-01-15T10:00:00.000Z');
      const date2 = new Date('2024-02-20T15:30:00.000Z');

      mockAuditService.findPaginated.mockResolvedValue({
        data: [
          { id: '1', action: 'A', entityType: 'T', entityId: 'e1', userId: null, createdAt: date1 },
          { id: '2', action: 'B', entityType: 'T', entityId: 'e2', userId: 'u1', createdAt: date2 },
        ],
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });

      const result = await controller.listAuditLogs(1, 20);

      expect(result.data[0].createdAt).toBe('2024-01-15T10:00:00.000Z');
      expect(result.data[1].createdAt).toBe('2024-02-20T15:30:00.000Z');
    });
  });
});
