/** Order line item as returned in API responses */
export interface IOrderItemResponse {
    id: string;
    orderId: string;
    productId: string;
    productName: string;
    quantityOrdered: number;
    quantityRefunded: number;
    price: number;
}
