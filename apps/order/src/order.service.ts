import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import {
  CreateOrderDto,
  CreateOrderWithPaymentResultDto,
} from './core/dto';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @Inject('PAYMENT_SERVICE')
    private readonly paymentClient: ClientProxy,
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

  async createWithPayment(
    dto: CreateOrderDto,
    currency = 'USD',
    method = 'CARD',
  ): Promise<CreateOrderWithPaymentResultDto> {
    const order = await this.create(dto);
    if (!order) throw new Error('Order creation failed');

    const totalAmount = order.items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );

    let paymentResult: { success: boolean; transactionId?: string | null; message?: string };
    try {
      paymentResult = await firstValueFrom(
        this.paymentClient.send(
          { cmd: 'payment.process' },
          {
            orderId: order.id,
            amount: totalAmount,
            currency,
            method,
          },
        ),
      );
    } catch {
      paymentResult = { success: false, transactionId: null, message: 'Payment service unavailable' };
    }

    const paymentSuccess = paymentResult.success === true;
    const transactionId = paymentResult.transactionId ?? null;
    await this.orderRepo.update(order.id, {
      status: paymentSuccess ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED',
      transactionId,
    });

    const updated = await this.orderRepo.findOne({
      where: { id: order.id },
      relations: ['items'],
    });
    return {
      order: updated!,
      paymentSuccess,
      transactionId,
    };
  }

  async listByCustomer(customerId: string) {
    return this.orderRepo.find({
      where: { customerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }
}
