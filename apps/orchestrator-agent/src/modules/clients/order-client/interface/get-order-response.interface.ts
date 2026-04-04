export interface GetOrderResponse {
    orders: Order[];
}

export interface OrderItem {
    id: string;
    orderId: string;
    productId: string;
    productName: string;
    quantityOrdered: number;
    quantityRefunded: number;
    price: number;
}

export interface Order {
    orderId: string;
    status: string;
    customerId: string;
    createdAt: string;
    items?: OrderItem[];
}
