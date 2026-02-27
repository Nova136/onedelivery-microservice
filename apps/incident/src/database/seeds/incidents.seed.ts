import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { Incident } from '../entities/incidents.entity';

export default class IncidentSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(Incident);

    // Avoid duplicating seed data if it already exists
    const existing = await repo.count();
    if (existing > 0) {
      return;
    }

    const incidents: Partial<Incident>[] = [
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

    await repo.insert(incidents);
  }
}