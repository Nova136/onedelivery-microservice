import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditEvent } from './database/entities/audit-event.entity';

describe('AuditService', () => {
  let service: AuditService;

  const mockQueryBuilder = {
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditEvent),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);

    jest.clearAllMocks();
    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.skip.mockReturnThis();
    mockQueryBuilder.take.mockReturnThis();
  });

  describe('logEvent', () => {
    it('should create and save an audit event with all fields', async () => {
      const now = new Date();
      const mockEvent: AuditEvent = {
        id: 'uuid-1',
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: 'order-123',
        userId: 'user-456',
        metadata: { amount: 100 },
        createdAt: now,
      };

      mockRepository.create.mockReturnValue(mockEvent);
      mockRepository.save.mockResolvedValue(mockEvent);

      const result = await service.logEvent(
        'ORDER_CREATED',
        'Order',
        'order-123',
        'user-456',
        { amount: 100 },
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: 'order-123',
        userId: 'user-456',
        metadata: { amount: 100 },
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockEvent);
      expect(result).toEqual(mockEvent);
    });

    it('should default userId and metadata to null when not provided', async () => {
      const mockEvent: AuditEvent = {
        id: 'uuid-2',
        action: 'SYSTEM_EVENT',
        entityType: 'System',
        entityId: 'sys-1',
        userId: null,
        metadata: null,
        createdAt: new Date(),
      };

      mockRepository.create.mockReturnValue(mockEvent);
      mockRepository.save.mockResolvedValue(mockEvent);

      await service.logEvent('SYSTEM_EVENT', 'System', 'sys-1');

      expect(mockRepository.create).toHaveBeenCalledWith({
        action: 'SYSTEM_EVENT',
        entityType: 'System',
        entityId: 'sys-1',
        userId: null,
        metadata: null,
      });
    });

    it('should return the saved event from the repository', async () => {
      const savedEvent = { id: 'uuid-3' } as AuditEvent;
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockResolvedValue(savedEvent);

      const result = await service.logEvent('ACTION', 'Entity', 'id-1');

      expect(result).toBe(savedEvent);
    });
  });

  describe('query', () => {
    it('should return all events when no filters are provided', async () => {
      const events = [{ id: '1' }, { id: '2' }] as AuditEvent[];
      mockQueryBuilder.getMany.mockResolvedValue(events);

      const result = await service.query();

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('e');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('e.createdAt', 'DESC');
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual(events);
    });

    it('should filter by entityType', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.query('Order');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'e.entityType = :entityType',
        { entityType: 'Order' },
      );
    });

    it('should filter by entityId', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.query(undefined, 'order-123');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'e.entityId = :entityId',
        { entityId: 'order-123' },
      );
    });

    it('should filter by date range when both from and to are provided', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.query(undefined, undefined, '2024-01-01', '2024-12-31');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'e.createdAt BETWEEN :from AND :to',
        { from: '2024-01-01', to: '2024-12-31' },
      );
    });

    it('should not apply date filter when only from is provided', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.query(undefined, undefined, '2024-01-01', undefined);

      const calls = mockQueryBuilder.andWhere.mock.calls.map((c) => c[0]);
      expect(calls).not.toContain(expect.stringContaining('BETWEEN'));
    });

    it('should not apply date filter when only to is provided', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.query(undefined, undefined, undefined, '2024-12-31');

      const calls = mockQueryBuilder.andWhere.mock.calls.map((c) => c[0]);
      expect(calls).not.toContain(expect.stringContaining('BETWEEN'));
    });

    it('should apply all filters together', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.query('Order', 'order-123', '2024-01-01', '2024-12-31');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(3);
    });
  });

  describe('findPaginated', () => {
    it('should return paginated results with correct structure', async () => {
      const mockEvents = [{ id: '1' }, { id: '2' }] as AuditEvent[];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockEvents, 2]);

      const result = await service.findPaginated(1, 10);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        data: mockEvents,
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('should default page to 1 when page is 0', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findPaginated(0, 10);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(result.page).toBe(1);
    });

    it('should default page to 1 when page is negative', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findPaginated(-5, 10);

      expect(result.page).toBe(1);
    });

    it('should default limit to 20 when limit is 0', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findPaginated(1, 0);

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.limit).toBe(20);
    });

    it('should default limit to 20 when limit is negative', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findPaginated(1, -1);

      expect(result.limit).toBe(20);
    });

    it('should calculate totalPages correctly for exact multiple', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 20]);

      const result = await service.findPaginated(1, 10);

      expect(result.totalPages).toBe(2);
    });

    it('should round up totalPages for partial last page', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 25]);

      const result = await service.findPaginated(1, 10);

      expect(result.totalPages).toBe(3);
    });

    it('should return totalPages of 1 when total is 0', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findPaginated(1, 10);

      expect(result.totalPages).toBe(1);
    });

    it('should calculate correct skip offset for page 3', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 100]);

      await service.findPaginated(3, 10);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
    });

    it('should order results by createdAt DESC', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findPaginated(1, 10);

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('e.createdAt', 'DESC');
    });
  });
});
