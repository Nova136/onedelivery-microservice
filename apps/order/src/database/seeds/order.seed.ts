import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Order } from "../entities/order.entity";
import { OrderItem } from "../entities/order-item.entity";
import {
    OrderStatus,
    RefundStatus,
    PriorityOption,
} from "../entities/order.enum";

export default class OrderSeeder implements Seeder {
    public async run(dataSource: DataSource): Promise<void> {
        const orderRepository = dataSource.getRepository(Order);
        const orderItemRepository = dataSource.getRepository(OrderItem);

        const existing = await orderRepository.count();
        if (existing > 0) {
            return;
        }

        const customerId = "83593ca4-b975-4fef-a521-4a2a8d72dd81";

        const orders: Partial<Order>[] = [
            // Scenario 1: Delivered order for refund testing
            {
                id: "FD-0000-000001",
                customerId,
                status: OrderStatus.DELIVERED,
                deliveryAddress: "123 Delivered St, City",
                totalOrderValue: 12.0,
                createdAt: new Date(),
                updatedAt: new Date(),
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 2: Created order for cancellation testing
            {
                id: "FD-0000-000002",
                customerId,
                status: OrderStatus.CREATED,
                deliveryAddress: "456 Created Ave, Town",
                totalOrderValue: 5.5,
                createdAt: new Date(),
                updatedAt: new Date(),
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 3: Order in preparation for cancellation testing
            {
                id: "FD-0000-000003",
                customerId,
                status: OrderStatus.PREPARATION,
                deliveryAddress: "789 Preparation Rd, Village",
                totalOrderValue: 6.5,
                createdAt: new Date(),
                updatedAt: new Date(),
                priorityOption: PriorityOption.FAST,
            },
            // Scenario 4: Order in delivery for late-cancellation testing
            {
                id: "FD-0000-000004",
                customerId,
                status: OrderStatus.IN_DELIVERY,
                deliveryAddress: "101 Delivery Cres, Hamlet",
                totalOrderValue: 5.0,
                createdAt: new Date(),
                updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 5: Cancelled order
            {
                id: "FD-0000-000005",
                customerId,
                status: OrderStatus.CANCELLED,
                deliveryAddress: "212 Cancelled Lane, City",
                totalOrderValue: 4.5,
                createdAt: new Date(),
                updatedAt: new Date(),
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 6: Partially refunded order
            {
                id: "FD-0000-000006",
                customerId,
                status: OrderStatus.DELIVERED,
                deliveryAddress: "323 Refund Row, Town",
                totalOrderValue: 6.0,
                totalRefundValue: 3.0,
                refundStatus: RefundStatus.PARTIAL,
                createdAt: new Date(),
                updatedAt: new Date(),
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 7: Fully refunded order
            {
                id: "FD-0000-000007",
                customerId,
                status: OrderStatus.DELIVERED,
                deliveryAddress: "434 Refund Row, Town",
                totalOrderValue: 5.5,
                totalRefundValue: 5.5,
                refundStatus: RefundStatus.FULL,
                createdAt: new Date(),
                updatedAt: new Date(),
                priorityOption: PriorityOption.STANDARD,
            },
            // Scenario 8: Order in delivery but NOT late (Standard rejection)
            {
                id: "FD-0000-000008",
                customerId,
                status: OrderStatus.IN_DELIVERY,
                deliveryAddress: "555 Fresh Delivery St, City",
                totalOrderValue: 15.0,
                createdAt: new Date(),
                updatedAt: new Date(),
                priorityOption: PriorityOption.FAST,
            },
            // Scenario 9: High value order for $20+ refund limit test
            {
                id: "FD-0000-000009",
                customerId,
                status: OrderStatus.DELIVERED,
                deliveryAddress: "777 High Roller Blvd, City",
                totalOrderValue: 55.0,
                createdAt: new Date(),
                updatedAt: new Date(),
                priorityOption: PriorityOption.STANDARD,
            },
        ];

        const orderItems: Partial<OrderItem>[] = [
            // Items for Scenario 1
            {
                orderId: "FD-0000-000001",
                productId: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // Hainanese Chicken Rice
                productName: "Hainanese Chicken Rice",
                price: 5.5,
                quantityOrdered: 1,
                itemValue: 5.5,
            },
            {
                orderId: "FD-0000-000001",
                productId: "b2c3d4e5-f6a7-8901-2345-678901bcdef0", // Laksa
                productName: "Laksa",
                price: 6.5,
                quantityOrdered: 1,
                itemValue: 6.5,
            },
            // Item for Scenario 2
            {
                orderId: "FD-0000-000002",
                productId: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // Hainanese Chicken Rice
                productName: "Hainanese Chicken Rice",
                price: 5.5,
                quantityOrdered: 1,
                itemValue: 5.5,
            },
            // Item for Scenario 3
            {
                orderId: "FD-0000-000003",
                productId: "b2c3d4e5-f6a7-8901-2345-678901bcdef0", // Laksa
                productName: "Laksa",
                price: 6.5,
                quantityOrdered: 1,
                itemValue: 6.5,
            },
            // Item for Scenario 4
            {
                orderId: "FD-0000-000004",
                productId: "c3d4e5f6-a7b8-9012-3456-789012cdef01", // Char Kway Teow
                productName: "Char Kway Teow",
                price: 5.0,
                quantityOrdered: 1,
                itemValue: 5.0,
            },
            // Item for Scenario 5
            {
                orderId: "FD-0000-000005",
                productId: "d4e5f6a7-b8c9-0123-4567-890123def012", // Nasi Lemak
                productName: "Nasi Lemak",
                price: 4.5,
                quantityOrdered: 1,
                itemValue: 4.5,
            },
            // Item for Scenario 6
            {
                orderId: "FD-0000-000006",
                productId: "e5f6a7b8-c9d0-1234-5678-901234ef0123", // Roti Prata
                productName: "Roti Prata",
                price: 3.0,
                quantityOrdered: 2,
                quantityRefunded: 1,
                itemValue: 6.0,
            },
            // Item for Scenario 7
            {
                orderId: "FD-0000-000007",
                productId: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // Hainanese Chicken Rice
                productName: "Hainanese Chicken Rice",
                price: 5.5,
                quantityOrdered: 1,
                quantityRefunded: 1,
                itemValue: 5.5,
            },
            // Item for Scenario 8
            {
                orderId: "FD-0000-000008",
                productId: "f6a7b8c9-d0e1-2345-6789-0123456789ab", // Pad Thai
                productName: "Pad Thai",
                price: 15.0,
                quantityOrdered: 1,
                itemValue: 15.0,
            },
            // Item for Scenario 9
            {
                orderId: "FD-0000-000009",
                productId: "ae61d854-8baa-471c-a8c0-bfdd19ff3e3d", // Whole Lobster
                productName: "Whole Lobster",
                price: 50.0,
                quantityOrdered: 1,
                itemValue: 50.0,
            },
        ];

        await orderRepository.insert(orders);
        await orderItemRepository.insert(orderItems);
    }
}
