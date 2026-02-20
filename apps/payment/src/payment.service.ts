import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Refund } from './entities/refund.entity';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
  ) {}

  async process(orderId: string, amount: number, currency: string, method: string) {
    const payment = this.paymentRepo.create({
      orderId,
      amount,
      currency,
      method,
      status: 'COMPLETED',
      externalId: `ext-${Date.now()}`,
    });
    return this.paymentRepo.save(payment);
  }

  async getById(paymentId: string) {
    return this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['refunds'],
    });
  }

  async refund(paymentId: string, amount: number, reason?: string) {
    const refund = this.refundRepo.create({
      paymentId,
      amount,
      reason: reason ?? null,
      status: 'REFUNDED',
    });
    return this.refundRepo.save(refund);
  }
}
