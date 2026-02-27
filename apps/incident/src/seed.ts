import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Incident } from './entities/incidents.entity';
import { seedIncidents } from 'seed/data/incident.incidents';

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
    schema: 'audit',
    entities: [Incident],
    synchronize: false,
  });

  await dataSource.initialize();
  const eventRepo = dataSource.getRepository(Incident);

  const existingEvents = await eventRepo.count();
  if (existingEvents > 0) {
    console.log('[audit] Audit tables already have data, skipping seed.');
    await dataSource.destroy();
    process.exit(0);
  }

  const events = eventRepo.create(seedIncidents);
  await eventRepo.save(events);
  console.log(`[audit] Seeded ${events.length} audit events.`);
  await dataSource.destroy();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
