import { SEED_ORDER_IDS } from './order.ids';

/**
 * Payment seed data. orderId must match ids from order seed (order.ids / order.orders).
 */
export const seedPayments = [
  { orderId: SEED_ORDER_IDS.order1, amount: 24.97, currency: 'SGD', status: 'COMPLETED', method: 'card', externalId: 'pay_ext_001' },
  { orderId: SEED_ORDER_IDS.order2, amount: 5.99, currency: 'SGD', status: 'COMPLETED', method: 'paynow', externalId: 'pay_ext_002' },
  { orderId: SEED_ORDER_IDS.order3, amount: 8.97, currency: 'SGD', status: 'PENDING', method: 'card', externalId: null },
];

/** Refund seed: paymentId will be set when payments are created (we'll attach refunds after insert). */
export const seedRefunds = [
  { amount: 12.99, reason: 'Customer requested return', status: 'COMPLETED' },
];
