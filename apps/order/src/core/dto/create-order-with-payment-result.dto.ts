import { Order } from '../../database/entities/order.entity';

/** Internal result from createWithPayment (order entity + payment outcome) */
export interface CreateOrderWithPaymentResultDto {
  order: Order;
  paymentSuccess: boolean;
  transactionId: string | null;
}
