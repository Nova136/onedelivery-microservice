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
import { getRepositoryToken } from '@nestjs/typeorm';
import { LogisticsService } from './logistics.service';
import { Delivery } from './database/entities/delivery.entity';
import { DeliveryTracking } from './database/entities/delivery-tracking.entity';

describe('LogisticsService', () => {
  let service: LogisticsService;

  const mockDeliveryRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTrackingRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogisticsService,
        { provide: getRepositoryToken(Delivery), useValue: mockDeliveryRepo },
        { provide: getRepositoryToken(DeliveryTracking), useValue: mockTrackingRepo },
      ],
    }).compile();

    service = module.get<LogisticsService>(LogisticsService);
    jest.clearAllMocks();
  });

  describe('trackByOrderId', () => {
    it('should return delivery with tracking by orderId', async () => {
      const delivery = { id: 'del-1', orderId: 'order-1', status: 'PENDING', tracking: [] };
      mockDeliveryRepo.findOne.mockResolvedValue(delivery);

      const result = await service.trackByOrderId('order-1');

      expect(mockDeliveryRepo.findOne).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        relations: ['tracking'],
      });
      expect(result).toEqual(delivery);
    });

    it('should return null when no delivery found', async () => {
      mockDeliveryRepo.findOne.mockResolvedValue(null);

      const result = await service.trackByOrderId('unknown');

      expect(result).toBeNull();
    });
  });

  describe('createDelivery', () => {
    it('should create and save a delivery with PENDING status', async () => {
      const delivery = { id: 'del-1', orderId: 'order-1', status: 'PENDING' };
      mockDeliveryRepo.create.mockReturnValue(delivery);
      mockDeliveryRepo.save.mockResolvedValue(delivery);

      const result = await service.createDelivery('order-1');

      expect(mockDeliveryRepo.create).toHaveBeenCalledWith({
        orderId: 'order-1',
        status: 'PENDING',
      });
      expect(mockDeliveryRepo.save).toHaveBeenCalledWith(delivery);
      expect(result).toEqual(delivery);
    });
  });

  describe('updateDelivery', () => {
    it('should return null when delivery not found', async () => {
      mockDeliveryRepo.findOne.mockResolvedValue(null);

      const result = await service.updateDelivery('unknown', 'IN_TRANSIT');

      expect(result).toBeNull();
    });

    it('should update status and return updated delivery without location', async () => {
      const delivery = { id: 'del-1', orderId: 'order-1', status: 'PENDING' };
      const updated = { ...delivery, status: 'IN_TRANSIT', tracking: [] };
      mockDeliveryRepo.findOne
        .mockResolvedValueOnce(delivery)
        .mockResolvedValueOnce(updated);
      mockDeliveryRepo.save.mockResolvedValue(updated);

      const result = await service.updateDelivery('order-1', 'IN_TRANSIT');

      expect(delivery.status).toBe('IN_TRANSIT');
      expect(mockDeliveryRepo.save).toHaveBeenCalledWith(delivery);
      expect(mockTrackingRepo.create).not.toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('should create a tracking entry when location is provided', async () => {
      const delivery = { id: 'del-1', orderId: 'order-1', status: 'PENDING' };
      const tracking = { id: 'track-1', deliveryId: 'del-1', lat: 1.3, lng: 103.8 };
      const updated = { ...delivery, status: 'IN_TRANSIT', tracking: [tracking] };
      mockDeliveryRepo.findOne
        .mockResolvedValueOnce(delivery)
        .mockResolvedValueOnce(updated);
      mockDeliveryRepo.save.mockResolvedValue(updated);
      mockTrackingRepo.create.mockReturnValue(tracking);
      mockTrackingRepo.save.mockResolvedValue(tracking);

      const result = await service.updateDelivery('order-1', 'IN_TRANSIT', { lat: 1.3, lng: 103.8 });

      expect(mockTrackingRepo.create).toHaveBeenCalledWith({
        deliveryId: 'del-1',
        lat: 1.3,
        lng: 103.8,
      });
      expect(mockTrackingRepo.save).toHaveBeenCalledWith(tracking);
      expect(result).toEqual(updated);
    });

    it('should return the updated delivery with relations', async () => {
      const delivery = { id: 'del-1', orderId: 'order-1', status: 'PENDING' };
      const updated = { id: 'del-1', orderId: 'order-1', status: 'DELIVERED', tracking: [] };
      mockDeliveryRepo.findOne
        .mockResolvedValueOnce(delivery)
        .mockResolvedValueOnce(updated);
      mockDeliveryRepo.save.mockResolvedValue(updated);

      const result = await service.updateDelivery('order-1', 'DELIVERED');

      expect(mockDeliveryRepo.findOne).toHaveBeenLastCalledWith({
        where: { id: 'del-1' },
        relations: ['tracking'],
      });
      expect(result).toEqual(updated);
    });
  });
});
