export interface CreateOrderDto {
  customerId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  deliveryAddress: string;
}
