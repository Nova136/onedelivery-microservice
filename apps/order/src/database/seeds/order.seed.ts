import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { Order } from '../entities/order.entity';

export default class OrderSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(Order);

    // Avoid duplicating seed data if it already exists
    const existing = await repo.count();
    if (existing > 0) {
      return;
    }

    const orders: Partial<Order>[] = [
      {
        customerId: 'cust-seed-001',
        status: 'PENDING',
        deliveryAddress: '123 Main St, Singapore 123456',
      },
      {
        customerId: 'cust-seed-002',
        status: 'SHIPPED',
        deliveryAddress: '456 Oak Ave, Singapore 234567',
      },
    ];

    await repo.insert(orders);
  }
}