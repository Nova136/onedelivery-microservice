import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';

export interface CreateOrderDto {
  customerId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  deliveryAddress: string;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
  ) {}

  async getById(orderId: string) {
    return this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    });
  }

  async create(dto: CreateOrderDto) {
    const order = this.orderRepo.create({
      customerId: dto.customerId,
      deliveryAddress: dto.deliveryAddress,
      status: 'CREATED',
    });
    const saved = await this.orderRepo.save(order);
    const items = dto.items.map((it) =>
      this.orderItemRepo.create({
        orderId: saved.id,
        productId: it.productId,
        quantity: it.quantity,
        price: it.price,
      }),
    );
    await this.orderItemRepo.save(items);
    return this.orderRepo.findOne({
      where: { id: saved.id },
      relations: ['items'],
    });
  }

  async listByCustomer(customerId: string) {
    return this.orderRepo.find({
      where: { customerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }
}
