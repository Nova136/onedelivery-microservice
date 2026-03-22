import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { Refund } from './database/entities/refund.entity';
import { CommonService } from '@libs/modules/common/common.service';
import {
  AuditLogRequest,
  AuditLogResponse,
  LogIncidentRequest,
  LogIncidentResponse,
} from '@libs/utils/rabbitmq-interfaces';
import { Payment } from './database/entities/payment.entity';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    @Inject('AUDIT_SERVICE')
    private readonly auditClient: ClientProxy,
    @Inject('INCIDENT_SERVICE')
    private readonly incidentClient: ClientProxy,
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

  async getByOrderId(orderId: string) {
    return this.paymentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
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

    // Log refund as incident for tracking
    // const incidentPayload: LogIncidentRequest = {
    //   type: 'PAYMENT_REFUNDED',
    //   summary: `Refund of ${amount} for payment ${paymentId}${reason ? `: ${reason}` : ''}`,
    //   orderId: undefined,
    // };
    // console.log('[PaymentService] Sending incident log (refund)', { paymentId, amount });
    // this.commonService
    //   .sendViaRMQ<LogIncidentResponse>(this.incidentClient, { cmd: 'incident.log' }, incidentPayload)
    //   .then((res) => {
    //     console.log('[PaymentService] Incident log sent', res?.incidentId ?? res);
    //   })
    //   .catch((err) => {
    //     console.error('[PaymentService] Failed to send incident log for refund', err?.message ?? err);
    //   });

    return saved;
  }
}
