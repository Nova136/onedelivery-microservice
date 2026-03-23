import { PriorityOption } from '../../database/entities/order.enum';

export interface CreateOrderDto {
  customerId: string;
  items: Array<{ productId:string; productName: string; quantity: number; price: number }>;
  deliveryAddress: string;
  priorityOption?: PriorityOption;
}
