import { IOrderItemResponse } from "./order-item-response.interface";

/** Single order as returned in list/get responses */
export interface IOrderResponse {
    orderId: string;
    status: string;
    customerId: string;
    deliveryAddress: string;
    priorityOption: string;
    transactionId: string | null;
    createdAt: string;
    items: IOrderItemResponse[];
    totalOrderValue: number;
    totalRefundValue: number;
    refundStatus: string;
}
