
import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { Payment } from '../entities/payment.entity';
const { v4: uuidv4 } = require('uuid');

export default class PaymentSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(Payment);


    const payments: Partial<Payment>[] = [
      {
        orderId: uuidv4(),
        amount: 49.99,
        currency: 'USD',
        status: 'COMPLETED',
        method: 'CARD',
        externalId: 'ext-seed-001',
      },
      {
        orderId: uuidv4(),
        amount: 19.99,
        currency: 'USD',
        status: 'PENDING',
        method: 'CARD',
        externalId: 'ext-seed-002',
      },
    ];

    await repo.insert(payments);
  }
}