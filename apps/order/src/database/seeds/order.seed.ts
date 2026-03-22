import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Order } from "../entities/order.entity";
import { OrderItem } from "../entities/order-item.entity";
import { OrderStatus, RefundStatus, PriorityOption } from "../entities/order.enum";

export default class OrderSeeder implements Seeder {
    public async run(dataSource: DataSource): Promise<void> {
        const orderRepository = dataSource.getRepository(Order);
        const orderItemRepository = dataSource.getRepository(OrderItem);

        const existing = await orderRepository.count();
        if (existing > 0) {
            return;
        }

        const customerId = "79eb6c83-1851-466b-9d2f-b74aaa5d0f1c";

        const orders: Partial<Order>[] = [
            // Scenario 1: Delivered order for refund testing
            {
                id: "d9e8dc2a-5e4f-4d8f-9a3b-2b6e8e6f8a3d",
                customerId,
                status: OrderStatus.DELIVERED,
                deliveryAddress: "123 Delivered St, City",
                totalOrderValue: 12.0,
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 2: Created order for cancellation testing
            {
                id: "c8d7b6a5-4f3e-2d1c-b0a9-9f8e7d6c5b4a",
                customerId,
                status: OrderStatus.CREATED,
                deliveryAddress: "456 Created Ave, Town",
                totalOrderValue: 5.5,
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 3: Order in preparation for cancellation testing
            {
                id: "b7c6a5b4-3e2d-1c0b-a998-8e7d6c5b4a39",
                customerId,
                status: OrderStatus.PREPARATION,
                deliveryAddress: "789 Preparation Rd, Village",
                totalOrderValue: 6.5,
                priorityOption: PriorityOption.FAST,
            },
            // Scenario 4: Order in delivery for late-cancellation testing
            {
                id: "a6b5c4d3-2d1c-0b9a-8a79-7d6c5b4a3928",
                customerId,
                status: OrderStatus.IN_DELIVERY,
                deliveryAddress: "101 Delivery Cres, Hamlet",
                totalOrderValue: 5.0,
                updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 5: Cancelled order
            {
                id: "f5a4b3c2-1b0a-9988-7a6b-6c5b4a392817",
                customerId,
                status: OrderStatus.CANCELLED,
                deliveryAddress: "212 Cancelled Lane, City",
                totalOrderValue: 4.5,
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 6: Partially refunded order
            {
                id: "e493a2b1-0a99-8877-6b5a-5a4b3c291806",
                customerId,
                status: OrderStatus.DELIVERED,
                deliveryAddress: "323 Refund Row, Town",
                totalOrderValue: 6.0,
                totalRefundValue: 3.0,
                refundStatus: RefundStatus.PARTIAL,
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 7: Fully refunded order
            {
                id: "d38291a0-9988-7766-5a4b-493a2b180795",
                customerId,
                status: OrderStatus.DELIVERED,
                deliveryAddress: "434 Refund Row, Town",
                totalOrderValue: 5.5,
                totalRefundValue: 5.5,
                refundStatus: RefundStatus.FULL,
                priorityOption: PriorityOption.STANDARD,
            },
        ];

        const orderItems: Partial<OrderItem>[] = [
            // Items for Scenario 1
            {
                orderId: "d9e8dc2a-5e4f-4d8f-9a3b-2b6e8e6f8a3d",
                productId: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // Hainanese Chicken Rice
                productName: "Hainanese Chicken Rice",
                price: 5.5,
                quantityOrdered: 1,
                itemValue: 5.5,
            },
            {
                orderId: "d9e8dc2a-5e4f-4d8f-9a3b-2b6e8e6f8a3d",
                productId: "b2c3d4e5-f6a7-8901-2345-678901bcdef0", // Laksa
                productName: "Laksa",
                price: 6.5,
                quantityOrdered: 1,
                itemValue: 6.5,
            },
            // Item for Scenario 2
            {
                orderId: "c8d7b6a5-4f3e-2d1c-b0a9-9f8e7d6c5b4a",
                productId: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // Hainanese Chicken Rice
                productName: "Hainanese Chicken Rice",
                price: 5.5,
                quantityOrdered: 1,
                itemValue: 5.5,
            },
            // Item for Scenario 3
            {
                orderId: "b7c6a5b4-3e2d-1c0b-a998-8e7d6c5b4a39",
                productId: "b2c3d4e5-f6a7-8901-2345-678901bcdef0", // Laksa
                productName: "Laksa",
                price: 6.5,
                quantityOrdered: 1,
                itemValue: 6.5,
            },
            // Item for Scenario 4
            {
                orderId: "a6b5c4d3-2d1c-0b9a-8a79-7d6c5b4a3928",
                productId: "c3d4e5f6-a7b8-9012-3456-789012cdef01", // Char Kway Teow
                productName: "Char Kway Teow",
                price: 5.0,
                quantityOrdered: 1,
                itemValue: 5.0,
            },
            // Item for Scenario 5
            {
                orderId: "f5a4b3c2-1b0a-9988-7a6b-6c5b4a392817",
                productId: "d4e5f6a7-b8c9-0123-4567-890123def012", // Nasi Lemak
                productName: "Nasi Lemak",
                price: 4.5,
                quantityOrdered: 1,
                itemValue: 4.5,
            },
            // Item for Scenario 6
            {
                orderId: "e493a2b1-0a99-8877-6b5a-5a4b3c291806",
                productId: "e5f6a7b8-c9d0-1234-5678-901234ef0123", // Roti Prata
                productName: "Roti Prata",
                price: 3.0,
                quantityOrdered: 2,
                quantityRefunded: 1,
                itemValue: 6.0,
            },
            // Item for Scenario 7
            {
                orderId: "d38291a0-9988-7766-5a4b-493a2b180795",
                productId: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // Hainanese Chicken Rice
                productName: "Hainanese Chicken Rice",
                price: 5.5,
                quantityOrdered: 1,
                quantityRefunded: 1,
                itemValue: 5.5,
            },
        ];

        await orderRepository.insert(orders);
        await orderItemRepository.insert(orderItems);
    }
}
