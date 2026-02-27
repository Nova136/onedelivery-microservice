import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { AuditEvent } from '../entities/audit-event.entity';

export default class AuditEventSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(AuditEvent);

    // Avoid duplicating seed data if it already exists
    const existing = await repo.count();
    if (existing > 0) {
      return;
    }

    const events: Partial<AuditEvent>[] = [
      {
        action: 'SYSTEM_INIT',
        entityType: 'System',
        entityId: 'bootstrap',
        userId: null,
        metadata: { message: 'Initial audit event seed' },
      },
    ];

    await repo.insert(events);
  }
}