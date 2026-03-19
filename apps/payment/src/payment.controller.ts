import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PaymentService } from './payment.service';

export interface ProcessPaymentDto {
  orderId: string;
  amount: number;
  currency: string;
  method: string;
}

export interface RefundDto {
  paymentId: string;
  amount: number;
  reason?: string;
}

@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @MessagePattern({ cmd: 'payment.process' })
  async processPayment(@Payload() data: ProcessPaymentDto) {
    try {
      const payment = await this.paymentService.process(
        data.orderId,
        data.amount,
        data.currency,
        data.method,
      );
      return {
        success: true,
        transactionId: payment.id,
        paymentId: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        amount: Number(payment.amount),
        message: 'Payment microservice: payment processed',
      };
    } catch (err) {
      return {
        success: false,
        transactionId: null,
        message: err instanceof Error ? err.message : 'Payment processing failed',
      };
    }
  }

  @MessagePattern({ cmd: 'payment.refund' })
  async refund(@Payload() data: RefundDto) {
    const refund = await this.paymentService.refund(
      data.paymentId,
      data.amount,
      data.reason,
    );
    return {
      refundId: refund.id,
      paymentId: refund.paymentId,
      status: refund.status,
      amount: Number(refund.amount),
      message: 'Payment microservice: refund processed',
    };
  }

  @MessagePattern({ cmd: 'payment.getByOrder' })
  async getPaymentByOrder(@Payload() data: { orderId: string }) {
    const payment = await this.paymentService.getByOrderId(data.orderId);
    if (!payment) return { orderId: data.orderId, found: false };
    return {
      found: true,
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amount: Number(payment.amount),
      refunds: payment.refunds?.map((r) => ({ id: r.id, amount: Number(r.amount) })),
      message: 'Payment microservice: payment retrieved by orderId',
    };
  }

  @MessagePattern({ cmd: 'payment.get' })
  async getPayment(@Payload() data: { paymentId: string }) {
    const payment = await this.paymentService.getById(data.paymentId);
    if (!payment) return { paymentId: data.paymentId, found: false };
    return {
      paymentId: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      refunds: payment.refunds?.map((r) => ({ id: r.id, amount: Number(r.amount) })),
      message: 'Payment microservice: payment retrieved',
    };
  }
}
