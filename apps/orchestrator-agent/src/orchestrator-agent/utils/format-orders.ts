import { Order } from "../../modules/clients/order-client/interface/get-order-response.interface";

export const formatOrders = (orders: Order[]) => {
    return orders
        .map((o) => {
            const itemsStr =
                o.items && o.items.length > 0
                    ? o.items
                          .map(
                              (i: any) =>
                                  `${i.quantityOrdered}x ${i.productName}`,
                          )
                          .join(", ")
                    : "No items listed";
            return `- ID: ${o.orderId}, Status: ${o.status}, Date: ${new Date(o.createdAt).toLocaleDateString()}, Items: [${itemsStr}]`;
        })
        .join("\n");
};
