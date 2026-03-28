export const formatOrders = (orders: any[]) => {
    if (!orders || orders.length === 0) return "No recent orders found.";
    return orders
        .map(
            (o) =>
                `- ID: ${o.orderId}, Status: ${o.status}, Date: ${new Date(o.createdAt).toLocaleDateString()}`,
        )
        .join("\n");
};
