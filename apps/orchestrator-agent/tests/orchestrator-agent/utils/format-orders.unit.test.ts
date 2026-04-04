import { formatOrders } from "../../../src/orchestrator-agent/utils/format-orders";

describe("Format Orders Utils", () => {
    it("should return empty string for empty input", () => {
        const result = formatOrders([]);
        expect(result).toBe("");
    });

    it("should format single order correctly", () => {
        const orders = [
            {
                orderId: "123",
                status: "delivered",
                createdAt: "2024-01-01T12:00:00Z",
                items: [{ productName: "Burger", quantityOrdered: 1 }],
            },
        ];
        const result = formatOrders(orders as any);
        expect(result).toContain("ID: 123");
        expect(result).toContain("Status: delivered");
        expect(result).toContain("1x Burger");
    });

    it("should format multiple items correctly", () => {
        const orders = [
            {
                orderId: "123",
                status: "delivered",
                createdAt: "2024-01-01T12:00:00Z",
                items: [
                    { productName: "Burger", quantityOrdered: 1 },
                    { productName: "Fries", quantityOrdered: 2 },
                ],
            },
        ];
        const result = formatOrders(orders as any);
        expect(result).toContain("1x Burger, 2x Fries");
    });

    it("should handle no items correctly", () => {
        const orders = [
            {
                orderId: "123",
                status: "delivered",
                createdAt: "2024-01-01T12:00:00Z",
                items: [],
            },
        ];
        const result = formatOrders(orders as any);
        expect(result).toContain("No items listed");
    });
});
