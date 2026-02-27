/**
 * Incident seed data (migrated from audit.incidents).
 */
export const seedIncidents = [
  {
    type: 'DELIVERY_DELAY',
    orderId: 'a0000001-0001-4000-8000-000000000002',
    summary: 'Shipment delayed by 24h due to weather.',
  },
  {
    type: 'COMPLAINT',
    orderId: null,
    summary: 'Customer feedback: packaging damaged.',
  },
];
