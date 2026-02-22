import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Refund } from './entities/refund.entity';
import { seedPayments, seedRefunds } from '../../../seed/data/payment.payments';

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
    schema: 'payment',
    entities: [Payment, Refund],
    synchronize: false,
  });

  await dataSource.initialize();
  const paymentRepo = dataSource.getRepository(Payment);
  const refundRepo = dataSource.getRepository(Refund);

  const existing = await paymentRepo.count();
  if (existing > 0) {
    console.log('[payment] Payments table already has data, skipping seed.');
    await dataSource.destroy();
    process.exit(0);
  }

  const payments = paymentRepo.create(seedPayments);
  await paymentRepo.save(payments);
  let refundCount = 0;
  if (seedRefunds.length > 0 && payments[0]) {
    const refunds = seedRefunds.map((r) => refundRepo.create({ ...r, paymentId: payments[0].id }));
    await refundRepo.save(refunds);
    refundCount = refunds.length;
  }
  console.log(`[payment] Seeded ${payments.length} payments and ${refundCount} refund(s).`);
  await dataSource.destroy();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
