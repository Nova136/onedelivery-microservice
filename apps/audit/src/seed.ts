import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { Incident } from './entities/incident.entity';
import { seedAuditEvents } from '../../../seed/data/audit.events';
import { seedIncidents } from '../../../seed/data/audit.incidents';

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
    schema: 'audit',
    entities: [AuditEvent, Incident],
    synchronize: false,
  });

  await dataSource.initialize();
  const eventRepo = dataSource.getRepository(AuditEvent);
  const incidentRepo = dataSource.getRepository(Incident);

  const existingEvents = await eventRepo.count();
  const existingIncidents = await incidentRepo.count();
  if (existingEvents > 0 && existingIncidents > 0) {
    console.log('[audit] Audit tables already have data, skipping seed.');
    await dataSource.destroy();
    process.exit(0);
  }

  let eventCount = 0;
  let incidentCount = 0;
  if (existingEvents === 0) {
    const events = eventRepo.create(seedAuditEvents);
    await eventRepo.save(events);
    eventCount = events.length;
  }
  if (existingIncidents === 0) {
    const incidents = incidentRepo.create(seedIncidents);
    await incidentRepo.save(incidents);
    incidentCount = incidents.length;
  }
  console.log(`[audit] Seeded ${eventCount} audit events and ${incidentCount} incidents.`);
  await dataSource.destroy();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
