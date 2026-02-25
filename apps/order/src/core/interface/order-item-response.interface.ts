/** Order line item as returned in API responses */
export interface IOrderItemResponse {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
}
