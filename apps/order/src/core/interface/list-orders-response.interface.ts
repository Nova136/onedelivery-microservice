import { IOrderResponse } from './order-response.interface';

/** Response shape for GET /order (list my orders) */
export interface IListOrdersResponse {
  orders: IOrderResponse[];
}
