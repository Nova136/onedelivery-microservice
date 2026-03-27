import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController, ProcessPaymentDto, RefundDto } from './payment.controller';
import { PaymentService } from './payment.service';

describe('PaymentController', () => {
  let controller: PaymentController;

  const mockPaymentService = {
    process: jest.fn(),
    refund: jest.fn(),
    getByOrderId: jest.fn(),
    getById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [{ provide: PaymentService, useValue: mockPaymentService }],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    jest.clearAllMocks();
  });

  describe('processPayment', () => {
    it('should return success response on successful payment', async () => {
      const payment = { id: 'pay-1', orderId: 'order-1', status: 'COMPLETED', amount: 100 };
      mockPaymentService.process.mockResolvedValue(payment);

      const dto: ProcessPaymentDto = { orderId: 'order-1', amount: 100, currency: 'USD', method: 'CARD' };
      const result = await controller.processPayment(dto);

      expect(mockPaymentService.process).toHaveBeenCalledWith('order-1', 100, 'USD', 'CARD');
      expect(result).toEqual({
        success: true,
        transactionId: 'pay-1',
        paymentId: 'pay-1',
        orderId: 'order-1',
        status: 'COMPLETED',
        amount: 100,
        message: 'Payment microservice: payment processed',
      });
    });

    it('should return failure response when service throws', async () => {
      mockPaymentService.process.mockRejectedValue(new Error('DB error'));

      const dto: ProcessPaymentDto = { orderId: 'order-1', amount: 100, currency: 'USD', method: 'CARD' };
      const result = await controller.processPayment(dto);

      expect(result).toEqual({
        success: false,
        transactionId: null,
        message: 'DB error',
      });
    });

    it('should use generic message for non-Error throws', async () => {
      mockPaymentService.process.mockRejectedValue('some string error');

      const dto: ProcessPaymentDto = { orderId: 'order-1', amount: 50, currency: 'USD', method: 'CARD' };
      const result = await controller.processPayment(dto);

      expect((result as any).message).toBe('Payment processing failed');
    });
  });

  describe('refund', () => {
    it('should return refund details', async () => {
      const refund = { id: 'ref-1', paymentId: 'pay-1', status: 'REFUNDED', amount: 25 };
      mockPaymentService.refund.mockResolvedValue(refund);

      const dto: RefundDto = { paymentId: 'pay-1', amount: 25 };
      const result = await controller.refund(dto);

      expect(mockPaymentService.refund).toHaveBeenCalledWith('pay-1', 25, undefined);
      expect(result).toEqual({
        refundId: 'ref-1',
        paymentId: 'pay-1',
        status: 'REFUNDED',
        amount: 25,
        message: 'Payment microservice: refund processed',
      });
    });
  });

  describe('getPaymentByOrder', () => {
    it('should return not found when no payment exists for order', async () => {
      mockPaymentService.getByOrderId.mockResolvedValue(null);

      const result = await controller.getPaymentByOrder({ orderId: 'order-x' });

      expect(result).toEqual({ orderId: 'order-x', found: false });
    });

    it('should return payment details when found', async () => {
      const payment = { id: 'pay-1', orderId: 'order-1', status: 'COMPLETED', amount: 100, refunds: [] };
      mockPaymentService.getByOrderId.mockResolvedValue(payment);

      const result = await controller.getPaymentByOrder({ orderId: 'order-1' });

      expect(result).toEqual({
        found: true,
        paymentId: 'pay-1',
        orderId: 'order-1',
        status: 'COMPLETED',
        amount: 100,
        refunds: [],
        message: 'Payment microservice: payment retrieved by orderId',
      });
    });
  });

  describe('getPayment', () => {
    it('should return not found when payment does not exist', async () => {
      mockPaymentService.getById.mockResolvedValue(null);

      const result = await controller.getPayment({ paymentId: 'unknown' });

      expect(result).toEqual({ paymentId: 'unknown', found: false });
    });

    it('should return payment details', async () => {
      const payment = { id: 'pay-1', status: 'COMPLETED', amount: 80, refunds: [] };
      mockPaymentService.getById.mockResolvedValue(payment);

      const result = await controller.getPayment({ paymentId: 'pay-1' });

      expect(result).toEqual({
        paymentId: 'pay-1',
        status: 'COMPLETED',
        amount: 80,
        refunds: [],
        message: 'Payment microservice: payment retrieved',
      });
    });
  });
});
