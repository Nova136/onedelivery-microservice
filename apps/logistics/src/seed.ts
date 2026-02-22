import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Product } from './entities/product.entity';
import { seedProducts } from '../../../seed/data/logistics.products';

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
    schema: 'logistics',
    entities: [Product],
    synchronize: false,
  });

  await dataSource.initialize();
  const repo = dataSource.getRepository(Product);

  const existing = await repo.count();
  if (existing > 0) {
    console.log('[logistics] Products table already has data, skipping seed.');
    await dataSource.destroy();
    process.exit(0);
  }

  const entities = seedProducts.map((p) => repo.create(p));
  await repo.save(entities);
  console.log(`[logistics] Seeded ${entities.length} products.`);
  await dataSource.destroy();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
