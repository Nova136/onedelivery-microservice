// Mock entities to avoid circular reference between Delivery and DeliveryTracking
jest.mock('./database/entities/delivery.entity', () => {
  class Delivery {}
  return { Delivery };
});
jest.mock('./database/entities/delivery-tracking.entity', () => {
  class DeliveryTracking {}
  return { DeliveryTracking };
});

import { Test, TestingModule } from '@nestjs/testing';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';

describe('LogisticsController', () => {
  let controller: LogisticsController;

  const mockLogisticsService = {
    trackByOrderId: jest.fn(),
    updateDelivery: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogisticsController],
      providers: [{ provide: LogisticsService, useValue: mockLogisticsService }],
    }).compile();

    controller = module.get<LogisticsController>(LogisticsController);
    jest.clearAllMocks();
  });

  describe('trackDelivery', () => {
    it('should return not found response when delivery does not exist', async () => {
      mockLogisticsService.trackByOrderId.mockResolvedValue(null);

      const result = await controller.trackDelivery({ orderId: 'order-1' });

      expect(result).toEqual({
        orderId: 'order-1',
        found: false,
        message: 'Logistics microservice: no delivery found',
      });
    });

    it('should return tracking info when delivery exists', async () => {
      const now = new Date();
      const delivery = {
        orderId: 'order-1',
        status: 'IN_TRANSIT',
        estimatedArrival: now,
        tracking: [{ lat: 1.3, lng: 103.8 }],
      };
      mockLogisticsService.trackByOrderId.mockResolvedValue(delivery);

      const result = await controller.trackDelivery({ orderId: 'order-1' });

      expect(result).toEqual({
        orderId: 'order-1',
        status: 'IN_TRANSIT',
        estimatedArrival: now.toISOString(),
        tracking: delivery.tracking,
        message: 'Logistics microservice: tracking info',
      });
    });

    it('should return null estimatedArrival when not set', async () => {
      const delivery = {
        orderId: 'order-1',
        status: 'PENDING',
        estimatedArrival: null,
        tracking: [],
      };
      mockLogisticsService.trackByOrderId.mockResolvedValue(delivery);

      const result = await controller.trackDelivery({ orderId: 'order-1' });

      expect((result as any).estimatedArrival).toBeNull();
    });
  });

  describe('updateDelivery', () => {
    it('should return updated status', async () => {
      const delivery = { id: 'del-1', orderId: 'order-1', status: 'IN_TRANSIT', tracking: [] };
      mockLogisticsService.updateDelivery.mockResolvedValue(delivery);

      const result = await controller.updateDelivery({
        orderId: 'order-1',
        status: 'IN_TRANSIT',
      });

      expect(mockLogisticsService.updateDelivery).toHaveBeenCalledWith(
        'order-1',
        'IN_TRANSIT',
        undefined,
      );
      expect(result).toEqual({
        orderId: 'order-1',
        status: 'IN_TRANSIT',
        message: 'Logistics microservice: delivery updated',
      });
    });

    it('should fall back to data.status when delivery is null', async () => {
      mockLogisticsService.updateDelivery.mockResolvedValue(null);

      const result = await controller.updateDelivery({
        orderId: 'order-x',
        status: 'DELIVERED',
      });

      expect((result as any).status).toBe('DELIVERED');
    });
  });

  describe('predictDelay', () => {
    it('should return delay info with reason On time when delivery exists', async () => {
      mockLogisticsService.trackByOrderId.mockResolvedValue({ id: 'del-1' });

      const result = await controller.predictDelay({ orderId: 'order-1' });

      expect(result).toEqual({
        orderId: 'order-1',
        delayMinutes: 0,
        reason: 'On time',
        message: 'Logistics microservice: delay prediction',
      });
    });

    it('should return No delivery record when delivery not found', async () => {
      mockLogisticsService.trackByOrderId.mockResolvedValue(null);

      const result = await controller.predictDelay({ orderId: 'order-x' });

      expect((result as any).reason).toBe('No delivery record');
    });
  });
});
