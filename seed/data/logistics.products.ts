/**
 * Logistics seed data: products (delivery options, add-ons, etc.)
 */
export const seedProducts = [
  { name: 'Express Delivery', description: 'Same-day delivery for urgent orders', sku: 'DELIV-EXPRESS', price: 12.99, active: true },
  { name: 'Standard Delivery', description: '2–3 business days', sku: 'DELIV-STD', price: 5.99, active: true },
  { name: 'Economy Shipping', description: '5–7 business days', sku: 'DELIV-ECON', price: 2.99, active: true },
  { name: 'Cold Chain Box S', description: 'Insulated small box for perishables', sku: 'BOX-COLD-S', price: 3.50, active: true },
  { name: 'Cold Chain Box M', description: 'Insulated medium box for perishables', sku: 'BOX-COLD-M', price: 5.00, active: true },
  { name: 'Cold Chain Box L', description: 'Insulated large box for perishables', sku: 'BOX-COLD-L', price: 7.50, active: true },
  { name: 'Gift Wrapping', description: 'Premium gift wrap and card', sku: 'SVC-GIFTWRAP', price: 4.99, active: true },
  { name: 'Signature Required', description: 'Add signature on delivery', sku: 'SVC-SIG', price: 2.49, active: true },
  { name: 'Fragile Handling', description: 'Extra care handling for fragile items', sku: 'SVC-FRAGILE', price: 6.99, active: true },
  { name: 'Returns Label', description: 'Pre-paid returns label', sku: 'SVC-RETURNS', price: 3.99, active: true },
];
