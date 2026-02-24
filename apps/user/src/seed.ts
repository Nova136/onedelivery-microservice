import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { seedUsers } from '../../../seed/data/user.users';
import { Role } from './entities/role.enum';

const SALT_ROUNDS = 10;

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/onedelivery',
    schema: 'user',
    entities: [User],
    synchronize: false,
  });

  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);

  const existing = await userRepo.count();
  if (existing > 0) {
    console.log('[user] Users table already has data, skipping seed.');
    await dataSource.destroy();
    process.exit(0);
  }

  const users = await Promise.all(
    seedUsers.map(async (u) => {
      const passwordHash = await bcrypt.hash(u.plainPassword, SALT_ROUNDS);
      return userRepo.create({ email: u.email, passwordHash, role: u.role as Role });
    }),
  );
  await userRepo.save(users);
  console.log(`[user] Seeded ${users.length} users (admin@onedelivery.demo / Admin123!, user@onedelivery.demo / User123!).`);
  await dataSource.destroy();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
