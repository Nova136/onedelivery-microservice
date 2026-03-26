import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { Payment } from './database/entities/payment.entity';
import { Refund } from './database/entities/refund.entity';
import { CommonService } from '@libs/modules/common/common.service';

describe('PaymentService', () => {
  let service: PaymentService;

  const mockPaymentRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockRefundRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAuditClient = {};
  const mockIncidentClient = {};
  const mockCommonService = {
    sendViaRMQ: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(Refund), useValue: mockRefundRepo },
        { provide: 'AUDIT_SERVICE', useValue: mockAuditClient },
        { provide: 'INCIDENT_SERVICE', useValue: mockIncidentClient },
        { provide: CommonService, useValue: mockCommonService },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    jest.clearAllMocks();
    mockCommonService.sendViaRMQ.mockResolvedValue({});
  });

  describe('process', () => {
    it('should create and save a payment with COMPLETED status', async () => {
      const payment = {
        id: 'pay-1',
        orderId: 'order-1',
        amount: 100,
        currency: 'USD',
        method: 'CARD',
        status: 'COMPLETED',
        externalId: 'ext-123',
      };
      mockPaymentRepo.create.mockReturnValue(payment);
      mockPaymentRepo.save.mockResolvedValue(payment);

      const result = await service.process('order-1', 100, 'USD', 'CARD');

      expect(mockPaymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          amount: 100,
          currency: 'USD',
          method: 'CARD',
          status: 'COMPLETED',
        }),
      );
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(result).toEqual(payment);
    });

    it('should fire-and-forget audit log after payment', async () => {
      const payment = { id: 'pay-1', orderId: 'order-1', amount: 50 };
      mockPaymentRepo.create.mockReturnValue(payment);
      mockPaymentRepo.save.mockResolvedValue(payment);

      await service.process('order-1', 50, 'USD', 'CARD');

      // Audit log is fire-and-forget; sendViaRMQ should be called
      expect(mockCommonService.sendViaRMQ).toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('should return payment with refunds by id', async () => {
      const payment = { id: 'pay-1', refunds: [] };
      mockPaymentRepo.findOne.mockResolvedValue(payment);

      const result = await service.getById('pay-1');

      expect(mockPaymentRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        relations: ['refunds'],
      });
      expect(result).toEqual(payment);
    });

    it('should return null when payment not found', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);
      const result = await service.getById('unknown');
      expect(result).toBeNull();
    });
  });

  describe('getByOrderId', () => {
    it('should return the most recent payment for an order', async () => {
      const payment = { id: 'pay-1', orderId: 'order-1', refunds: [] };
      mockPaymentRepo.findOne.mockResolvedValue(payment);

      const result = await service.getByOrderId('order-1');

      expect(mockPaymentRepo.findOne).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        order: { createdAt: 'DESC' },
        relations: ['refunds'],
      });
      expect(result).toEqual(payment);
    });
  });

  describe('refund', () => {
    it('should create and save a refund', async () => {
      const refund = { id: 'ref-1', paymentId: 'pay-1', amount: 25, status: 'REFUNDED', reason: null };
      mockRefundRepo.create.mockReturnValue(refund);
      mockRefundRepo.save.mockResolvedValue(refund);

      const result = await service.refund('pay-1', 25);

      expect(mockRefundRepo.create).toHaveBeenCalledWith({
        paymentId: 'pay-1',
        amount: 25,
        reason: null,
        status: 'REFUNDED',
      });
      expect(mockRefundRepo.save).toHaveBeenCalledWith(refund);
      expect(result).toEqual(refund);
    });

    it('should store the reason when provided', async () => {
      const refund = { id: 'ref-2', paymentId: 'pay-1', amount: 10, status: 'REFUNDED', reason: 'damaged' };
      mockRefundRepo.create.mockReturnValue(refund);
      mockRefundRepo.save.mockResolvedValue(refund);

      await service.refund('pay-1', 10, 'damaged');

      expect(mockRefundRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'damaged' }),
      );
    });
  });
});
