import { IOrderItemResponse } from './order-item-response.interface';

/** Response shape for POST /order */
export interface ICreateOrderResponse {
  orderId: string;
  status: string;
  customerId: string;
  deliveryAddress: string;
  createdAt: string;
  items: IOrderItemResponse[];
  paymentSuccess: boolean;
  transactionId: string | null;
}
