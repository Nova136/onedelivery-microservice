export const formatOrders = (orders: any[]) => {
    return orders
        .map((o) => {
            const itemsStr =
                o.items && o.items.length > 0
                    ? o.items
                          .map((i: any) => `${i.quantity}x ${i.name}`)
                          .join(", ")
                    : "No items listed";
            return `- ID: ${o.orderId}, Status: ${o.status}, Date: ${new Date(o.createdAt).toLocaleDateString()}, Items: [${itemsStr}]`;
        })
        .join("\n");
};
