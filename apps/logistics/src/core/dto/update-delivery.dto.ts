export interface UpdateDeliveryDto {
  orderId: string;
  status: string;
  location?: { lat: number; lng: number };
}
