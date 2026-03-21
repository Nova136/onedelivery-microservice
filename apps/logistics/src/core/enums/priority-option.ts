export interface PriorityOption {
  sku: string;
  name: string;
  description: string;
  price: number;
}

export const PRIORITY_OPTIONS: readonly PriorityOption[] = [
  {
    sku: 'PRIO-EXPRESS',
    name: 'Express Delivery',
    description: 'Same-day delivery for urgent orders',
    price: 12.99,
  },
  {
    sku: 'PRIO-STD',
    name: 'Standard Delivery',
    description: '2–3 business days',
    price: 5.99,
  },
  {
    sku: 'PRIO-ECON',
    name: 'Economy Shipping',
    description: '5–7 business days',
    price: 2.99,
  },
] as const;
