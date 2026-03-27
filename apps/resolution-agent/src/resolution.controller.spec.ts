import { Test, TestingModule } from '@nestjs/testing';
import { ResolutionController } from './resolution.controller';
import { ResolutionService } from './resolution.service';

describe('ResolutionController', () => {
  let controller: ResolutionController;

  const mockResolutionService = {
    processRefund: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResolutionController],
      providers: [{ provide: ResolutionService, useValue: mockResolutionService }],
    }).compile();

    controller = module.get<ResolutionController>(ResolutionController);
    jest.clearAllMocks();
  });

  describe('handleRefundRequest', () => {
    it('should call processRefund and return reply', async () => {
      mockResolutionService.processRefund.mockResolvedValue('SUCCESS: Refund of $10 processed');

      const payload = { userId: 'user-1', sessionId: 'session-1', message: '{"orderId":"order-1"}' };
      const result = await controller.handleRefundRequest(payload);

      expect(mockResolutionService.processRefund).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ reply: 'SUCCESS: Refund of $10 processed' });
    });

    it('should return rejection reply when service returns REJECTED', async () => {
      mockResolutionService.processRefund.mockResolvedValue('REJECTED: Order already refunded');

      const payload = { userId: 'user-1', sessionId: 'session-1', message: '{"orderId":"order-2"}' };
      const result = await controller.handleRefundRequest(payload);

      expect(result).toEqual({ reply: 'REJECTED: Order already refunded' });
    });

    it('should pass the full payload to processRefund', async () => {
      mockResolutionService.processRefund.mockResolvedValue('SUCCESS');

      const payload = { userId: 'user-42', sessionId: 'sess-99', message: 'some context' };
      await controller.handleRefundRequest(payload);

      expect(mockResolutionService.processRefund).toHaveBeenCalledWith(payload);
    });
  });
});
