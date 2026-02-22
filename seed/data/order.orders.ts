import { SEED_ORDER_IDS } from './order.ids';

/**
 * Order seed data. Uses fixed IDs so payment seed can reference these orders.
 */
export const seedOrders = [
  { id: SEED_ORDER_IDS.order1, customerId: 'cust-seed-001', status: 'CONFIRMED', deliveryAddress: '123 Main St, Singapore 123456' },
  { id: SEED_ORDER_IDS.order2, customerId: 'cust-seed-002', status: 'SHIPPED', deliveryAddress: '456 Oak Ave, Singapore 234567' },
  { id: SEED_ORDER_IDS.order3, customerId: 'cust-seed-001', status: 'PENDING', deliveryAddress: '789 Park Rd, Singapore 345678' },
];

/** Order items (orderId must match seed order ids; productId is logistics product reference). */
export const seedOrderItems = [
  { orderId: SEED_ORDER_IDS.order1, productId: '00000001-0001-4000-8000-000000000001', quantity: 2, price: 5.99 },
  { orderId: SEED_ORDER_IDS.order1, productId: '00000001-0001-4000-8000-000000000002', quantity: 1, price: 12.99 },
  { orderId: SEED_ORDER_IDS.order2, productId: '00000001-0001-4000-8000-000000000001', quantity: 1, price: 5.99 },
  { orderId: SEED_ORDER_IDS.order3, productId: '00000001-0001-4000-8000-000000000003', quantity: 3, price: 2.99 },
];
