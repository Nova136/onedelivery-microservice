import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Refund } from './entities/refund.entity';
import { CommonService } from '@libs/modules/common/common.service';
import { AuditLogRequest, AuditLogResponse } from '@libs/utils/rabbitmq-interfaces';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    @Inject('AUDIT_SERVICE')
    private readonly auditClient: ClientProxy,
    private readonly commonService: CommonService,
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
    const saved = await this.paymentRepo.save(payment);

    const auditPayload: AuditLogRequest = {
      action: 'PAYMENT_COMPLETED',
      entityType: 'Payment',
      entityId: saved.id,
      userId: undefined,
      metadata: {
        orderId,
        amount,
        currency,
        method,
      },
    };
    this.commonService
      .sendViaRMQ<AuditLogResponse>(this.auditClient, { cmd: 'audit.log' }, auditPayload)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to send audit log for payment', err?.message ?? err);
      });

    return saved;
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
    const saved = await this.refundRepo.save(refund);

    const auditPayload: AuditLogRequest = {
      action: 'PAYMENT_REFUNDED',
      entityType: 'Refund',
      entityId: saved.id,
      userId: undefined,
      metadata: {
        paymentId,
        amount,
        reason: reason ?? null,
      },
    };
    this.commonService
      .sendViaRMQ<AuditLogResponse>(this.auditClient, { cmd: 'audit.log' }, auditPayload)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to send audit log for refund', err?.message ?? err);
      });

    return saved;
  }
}
