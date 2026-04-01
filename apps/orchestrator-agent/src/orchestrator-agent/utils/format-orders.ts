export const formatOrders = (orders: any[]) => {
  return orders.map(o => `- ID: ${o.orderId}, Status: ${o.status}, Date: ${new Date(o.createdAt).toLocaleDateString()}`).join("\n");
};
