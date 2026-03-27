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
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderStatus, PriorityOption, RefundStatus } from './database/entities/order.enum';

describe('OrderController', () => {
  let controller: OrderController;

  const mockOrderService = {
    createWithPayment: jest.fn(),
    listByCustomer: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    updateItemRefunds: jest.fn(),
    listRecent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [{ provide: OrderService, useValue: mockOrderService }],
    }).compile();

    controller = module.get<OrderController>(OrderController);
    jest.clearAllMocks();
  });

  describe('createOrder (RMQ)', () => {
    it('should create an order and return basic info', async () => {
      const order = { id: 'order-1', status: OrderStatus.CREATED, customerId: 'cust-1', items: [] };
      mockOrderService.create.mockResolvedValue(order);

      const result = await controller.createOrder({
        customerId: 'cust-1',
        deliveryAddress: '123 St',
        items: [],
      });

      expect(result).toEqual({
        orderId: 'order-1',
        status: OrderStatus.CREATED,
        customerId: 'cust-1',
        message: 'Order microservice: order created',
      });
    });
  });

  describe('getOrder (RMQ)', () => {
    it('should return order details when found', async () => {
      const now = new Date();
      const order = {
        id: 'order-1',
        status: OrderStatus.CREATED,
        customerId: 'cust-1',
        deliveryAddress: '123 St',
        refundStatus: RefundStatus.NONE,
        totalRefundValue: 0,
        totalOrderValue: 50,
        items: [],
        createdAt: now,
        updatedAt: now,
      };
      mockOrderService.getById.mockResolvedValue(order);

      const result = await controller.getOrder({ orderId: 'order-1' });

      expect((result as any).orderId).toBe('order-1');
      expect((result as any).createdAt).toBe(now.toISOString());
    });

    it('should return not found when order does not exist', async () => {
      mockOrderService.getById.mockResolvedValue(null);

      const result = await controller.getOrder({ orderId: 'unknown' });

      expect(result).toEqual({ orderId: 'unknown', found: false });
    });
  });

  describe('updateRefund (RMQ)', () => {
    it('should return success response on successful refund update', async () => {
      const order = {
        id: 'order-1',
        refundStatus: RefundStatus.PARTIAL,
        totalRefundValue: 10,
        items: [{ id: 'item-1', orderId: 'order-1', productId: 'p1', productName: 'Widget', quantityOrdered: 2, quantityRefunded: 1, price: 10 }],
      };
      mockOrderService.updateItemRefunds.mockResolvedValue(order);

      const result = await controller.updateRefund({
        orderId: 'order-1',
        items: [{ orderItemId: 'item-1', quantity: 1 }],
      });

      expect((result as any).success).toBe(true);
      expect((result as any).refundStatus).toBe(RefundStatus.PARTIAL);
    });

    it('should return failure response when service throws', async () => {
      mockOrderService.updateItemRefunds.mockRejectedValue(new Error('Item not found'));

      const result = await controller.updateRefund({ orderId: 'order-1', items: [] });

      expect((result as any).success).toBe(false);
      expect((result as any).message).toBe('Item not found');
    });

    it('should return failure when order not found', async () => {
      mockOrderService.updateItemRefunds.mockResolvedValue(null);

      const result = await controller.updateRefund({ orderId: 'order-x', items: [] });

      expect((result as any).success).toBe(false);
    });
  });

  describe('listOrders (RMQ)', () => {
    it('should return formatted list of orders', async () => {
      const now = new Date();
      const orders = [
        { id: 'order-1', status: OrderStatus.CREATED, customerId: 'cust-1', createdAt: now, items: [] },
      ];
      mockOrderService.listByCustomer.mockResolvedValue(orders);

      const result = await controller.listOrders({ customerId: 'cust-1' });

      expect((result as any).orders[0]).toEqual({
        orderId: 'order-1',
        status: OrderStatus.CREATED,
        customerId: 'cust-1',
        createdAt: now.toISOString(),
        items: [],
      });
      expect((result as any).message).toBe('Order microservice: list returned');
    });
  });

  describe('getRecentOrders (RMQ)', () => {
    it('should return recent orders for a customer', async () => {
      const now = new Date();
      const orders = [{ id: 'order-1', status: OrderStatus.CREATED, customerId: 'cust-1', createdAt: now, items: [] }];
      mockOrderService.listRecent.mockResolvedValue(orders);

      const result = await controller.getRecentOrders({ customerId: 'cust-1' });

      expect((result as any).orders).toHaveLength(1);
      expect((result as any).message).toBe('Order microservice: list returned');
    });
  });
});
