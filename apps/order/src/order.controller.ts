import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OrderService } from './order.service';

export interface GetOrderDto {
  orderId: string;
}

export interface CreateOrderDto {
  customerId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  deliveryAddress: string;
}

@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @MessagePattern({ cmd: 'order.get' })
  async getOrder(@Payload() data: GetOrderDto) {
    const order = await this.orderService.getById(data.orderId);
    if (!order) return { orderId: data.orderId, found: false };
    return {
      orderId: order.id,
      status: order.status,
      customerId: order.customerId,
      deliveryAddress: order.deliveryAddress,
      items: order.items,
      createdAt: order.createdAt.toISOString(),
    };
  }

  @MessagePattern({ cmd: 'order.create' })
  async createOrder(@Payload() data: CreateOrderDto) {
    const order = await this.orderService.create(data);
    return {
      orderId: order!.id,
      status: order!.status,
      customerId: order!.customerId,
      message: 'Order microservice: order created',
    };
  }

  @MessagePattern({ cmd: 'order.list' })
  async listOrders(@Payload() data: { customerId?: string }) {
    const orders = await this.orderService.listByCustomer(data.customerId ?? '');
    return {
      orders: orders.map((o) => ({
        orderId: o.id,
        status: o.status,
        customerId: o.customerId,
        createdAt: o.createdAt.toISOString(),
        items: o.items,
      })),
      message: 'Order microservice: list returned',
    };
  }
}
