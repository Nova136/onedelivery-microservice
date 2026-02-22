/**
 * Fixed order IDs used in seed so payment (and other) seeds can reference them.
 * Order seed must run before payment seed.
 */
export const SEED_ORDER_IDS = {
  order1: 'a0000001-0001-4000-8000-000000000001',
  order2: 'a0000001-0001-4000-8000-000000000002',
  order3: 'a0000001-0001-4000-8000-000000000003',
} as const;
