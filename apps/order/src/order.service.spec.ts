// Mock entities to avoid circular reference between Order and OrderItem
jest.mock('./database/entities/order.entity', () => {
  class Order {}
  return { Order };
});
jest.mock('./database/entities/order-item.entity', () => {
  class OrderItem {}
  return { OrderItem };
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { Order } from './database/entities/order.entity';
import { OrderItem } from './database/entities/order-item.entity';
import { OrderStatus, PriorityOption, RefundStatus } from './database/entities/order.enum';
import { CommonService } from '@libs/modules/common/common.service';

describe('OrderService', () => {
  let service: OrderService;

  const mockOrderRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };

  const mockOrderItemRepo = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockPaymentClient = {};
  const mockAuditClient = {};
  const mockIncidentClient = {};
  const mockCommonService = {
    sendViaRMQ: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: mockOrderItemRepo },
        { provide: 'PAYMENT_SERVICE', useValue: mockPaymentClient },
        { provide: 'AUDIT_SERVICE', useValue: mockAuditClient },
        { provide: 'INCIDENT_SERVICE', useValue: mockIncidentClient },
        { provide: CommonService, useValue: mockCommonService },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    jest.clearAllMocks();
    mockCommonService.sendViaRMQ.mockResolvedValue({});
  });

  describe('getById', () => {
    it('should return order with items by id', async () => {
      const order = { id: 'order-1', items: [] };
      mockOrderRepo.findOne.mockResolvedValue(order);

      const result = await service.getById('order-1');

      expect(mockOrderRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        relations: ['items'],
      });
      expect(result).toEqual(order);
    });

    it('should return null when order not found', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);
      const result = await service.getById('unknown');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create an order and its items', async () => {
      const savedOrder = { id: 'order-1', customerId: 'cust-1', status: OrderStatus.CREATED, items: [] };
      const savedOrderWithItems = { ...savedOrder, items: [{ id: 'item-1' }] };
      mockOrderRepo.create.mockReturnValue(savedOrder);
      mockOrderRepo.save.mockResolvedValue(savedOrder);
      mockOrderRepo.findOne.mockResolvedValue(savedOrderWithItems);
      mockOrderItemRepo.create.mockImplementation((it) => it);
      mockOrderItemRepo.save.mockResolvedValue([]);

      const dto = {
        customerId: 'cust-1',
        deliveryAddress: '123 Street',
        items: [{ productId: 'prod-1', productName: 'Widget', quantity: 2, price: 10 }],
      };

      const result = await service.create(dto);

      expect(mockOrderRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          status: OrderStatus.CREATED,
          totalOrderValue: 20,
        }),
      );
      expect(mockOrderItemRepo.save).toHaveBeenCalled();
      expect(result).toEqual(savedOrderWithItems);
    });

    it('should use STANDARD priority when not specified', async () => {
      const savedOrder = { id: 'order-1', customerId: 'cust-1', status: OrderStatus.CREATED };
      mockOrderRepo.create.mockReturnValue(savedOrder);
      mockOrderRepo.save.mockResolvedValue(savedOrder);
      mockOrderRepo.findOne.mockResolvedValue(savedOrder);
      mockOrderItemRepo.create.mockImplementation((it) => it);
      mockOrderItemRepo.save.mockResolvedValue([]);

      await service.create({
        customerId: 'cust-1',
        deliveryAddress: '123 Street',
        items: [{ productId: 'p1', productName: 'Item', quantity: 1, price: 5 }],
      });

      expect(mockOrderRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ priorityOption: PriorityOption.STANDARD }),
      );
    });
  });

  describe('listByCustomer', () => {
    it('should return orders for a customer ordered by createdAt DESC', async () => {
      const orders = [{ id: 'order-1' }, { id: 'order-2' }];
      mockOrderRepo.find.mockResolvedValue(orders);

      const result = await service.listByCustomer('cust-1');

      expect(mockOrderRepo.find).toHaveBeenCalledWith({
        where: { customerId: 'cust-1' },
        relations: ['items'],
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(orders);
    });
  });

  describe('createWithPayment', () => {
    it('should mark order as PAYMENT_COMPLETED on successful payment', async () => {
      const order = { id: 'order-1', customerId: 'cust-1', items: [{ price: 10, quantityOrdered: 2 }] };
      const orderWithItems = { ...order, createdAt: new Date(), updatedAt: new Date() };
      mockOrderRepo.create.mockReturnValue(order);
      mockOrderRepo.save.mockResolvedValue(order);
      mockOrderRepo.findOne.mockResolvedValue(orderWithItems);
      mockOrderRepo.update.mockResolvedValue({});
      mockOrderItemRepo.create.mockImplementation((it) => it);
      mockOrderItemRepo.save.mockResolvedValue([]);
      mockCommonService.sendViaRMQ.mockResolvedValue({
        success: true,
        transactionId: 'txn-1',
      });

      const dto = {
        customerId: 'cust-1',
        deliveryAddress: '123 Street',
        items: [{ productId: 'p1', productName: 'Item', quantity: 2, price: 10 }],
      };

      const result = await service.createWithPayment(dto);

      expect(mockOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ status: OrderStatus.PAYMENT_COMPLETED }),
      );
      expect(result.paymentSuccess).toBe(true);
    });

    it('should mark order as PAYMENT_FAILED when payment fails', async () => {
      const order = { id: 'order-1', customerId: 'cust-1', items: [{ price: 10, quantityOrdered: 1 }] };
      mockOrderRepo.create.mockReturnValue(order);
      mockOrderRepo.save.mockResolvedValue(order);
      mockOrderRepo.findOne.mockResolvedValue(order);
      mockOrderRepo.update.mockResolvedValue({});
      mockOrderItemRepo.create.mockImplementation((it) => it);
      mockOrderItemRepo.save.mockResolvedValue([]);
      mockCommonService.sendViaRMQ
        .mockResolvedValueOnce({ success: false, transactionId: null, message: 'Declined' })
        .mockResolvedValue({});

      const dto = {
        customerId: 'cust-1',
        deliveryAddress: '123 Street',
        items: [{ productId: 'p1', productName: 'Item', quantity: 1, price: 10 }],
      };

      const result = await service.createWithPayment(dto);

      expect(mockOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ status: OrderStatus.PAYMENT_FAILED }),
      );
      expect(result.paymentSuccess).toBe(false);
    });

    it('should treat payment service unavailability as failure', async () => {
      const order = { id: 'order-1', customerId: 'cust-1', items: [{ price: 5, quantityOrdered: 1 }] };
      mockOrderRepo.create.mockReturnValue(order);
      mockOrderRepo.save.mockResolvedValue(order);
      mockOrderRepo.findOne.mockResolvedValue(order);
      mockOrderRepo.update.mockResolvedValue({});
      mockOrderItemRepo.create.mockImplementation((it) => it);
      mockOrderItemRepo.save.mockResolvedValue([]);
      mockCommonService.sendViaRMQ.mockRejectedValueOnce(new Error('Service down'));

      const dto = {
        customerId: 'cust-1',
        deliveryAddress: '123 Street',
        items: [{ productId: 'p1', productName: 'Item', quantity: 1, price: 5 }],
      };

      const result = await service.createWithPayment(dto);

      expect(result.paymentSuccess).toBe(false);
    });
  });

  describe('updateItemRefunds', () => {
    it('should throw when order not found', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);

      await expect(service.updateItemRefunds('unknown', [])).rejects.toThrow('Order unknown not found');
    });

    it('should throw when item not found in order', async () => {
      const order = { id: 'order-1', items: [{ id: 'item-1', quantityOrdered: 2, quantityRefunded: 0 }] };
      mockOrderRepo.findOne.mockResolvedValue(order);

      await expect(
        service.updateItemRefunds('order-1', [{ orderItemId: 'item-x', quantity: 1 }]),
      ).rejects.toThrow('Order item item-x not found in order order-1');
    });

    it('should throw when refund exceeds ordered quantity', async () => {
      const order = {
        id: 'order-1',
        items: [{ id: 'item-1', quantityOrdered: 2, quantityRefunded: 1 }],
      };
      mockOrderRepo.findOne.mockResolvedValue(order);

      await expect(
        service.updateItemRefunds('order-1', [{ orderItemId: 'item-1', quantity: 2 }]),
      ).rejects.toThrow(/exceed ordered quantity/);
    });

    it('should set refund status to FULL when all items fully refunded', async () => {
      const order = {
        id: 'order-1',
        items: [{ id: 'item-1', quantityOrdered: 1, quantityRefunded: 0, price: 10 }],
      };
      const refreshed = {
        id: 'order-1',
        items: [{ id: 'item-1', quantityOrdered: 1, quantityRefunded: 1, price: 10 }],
      };
      mockOrderRepo.findOne
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce(refreshed);
      mockOrderItemRepo.update.mockResolvedValue({});
      mockOrderRepo.update.mockResolvedValue({});
      mockOrderRepo.findOne.mockResolvedValueOnce(refreshed);

      await service.updateItemRefunds('order-1', [{ orderItemId: 'item-1', quantity: 1 }]);

      expect(mockOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ refundStatus: RefundStatus.FULL }),
      );
    });
  });
});
