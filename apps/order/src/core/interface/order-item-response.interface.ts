/** Order line item as returned in API responses */
export interface IOrderItemResponse {
    id: string;
    orderId: string;
    productId: string;
    quantityOrdered: number;
    quantityRefunded: number;
    price: number;
}
