import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { seedOrders, seedOrderItems } from '../../../seed/data/order.orders';

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
    schema: 'order',
    entities: [Order, OrderItem],
    synchronize: false,
  });

  await dataSource.initialize();
  const orderRepo = dataSource.getRepository(Order);
  const itemRepo = dataSource.getRepository(OrderItem);

  const existing = await orderRepo.count();
  if (existing > 0) {
    console.log('[order] Orders table already has data, skipping seed.');
    await dataSource.destroy();
    process.exit(0);
  }

  const orders = orderRepo.create(seedOrders);
  await orderRepo.save(orders);
  const items = seedOrderItems.map((i) => itemRepo.create(i));
  await itemRepo.save(items);
  console.log(`[order] Seeded ${orders.length} orders and ${items.length} order items.`);
  await dataSource.destroy();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
