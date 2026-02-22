/**
 * Audit event seed data (sample events for demo).
 */
export const seedAuditEvents = [
  { action: 'ORDER_CREATED', entityType: 'Order', entityId: 'a0000001-0001-4000-8000-000000000001', userId: null, metadata: { source: 'seed' } },
  { action: 'ORDER_UPDATED', entityType: 'Order', entityId: 'a0000001-0001-4000-8000-000000000001', userId: null, metadata: { status: 'CONFIRMED' } },
  { action: 'PAYMENT_COMPLETED', entityType: 'Payment', entityId: 'pay-001', userId: null, metadata: { amount: 24.97 } },
  { action: 'USER_LOGIN', entityType: 'User', entityId: 'user-001', userId: 'user-001', metadata: null },
];
