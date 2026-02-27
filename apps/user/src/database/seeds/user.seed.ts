import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.enum';

const SALT_ROUNDS = 10;

export default class UserSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(User);

    // Avoid duplicating seed data if it already exists
    const existing = await repo.count();
    if (existing > 0) {
      return;
    }

    const users: Array<Partial<User> & { plainPassword: string }> = [
      {
        email: 'admin@onedelivery.demo',
        role: Role.Admin,
        plainPassword: 'Admin123!',
      },
      {
        email: 'user@onedelivery.demo',
        role: Role.User,
        plainPassword: 'User123!',
      },
    ];

    const toInsert: Partial<User>[] = [];
    for (const u of users) {
      const passwordHash = await bcrypt.hash(u.plainPassword, SALT_ROUNDS);
      toInsert.push({
        email: u.email.toLowerCase(),
        role: u.role,
        passwordHash,
      });
    }

    await repo.insert(toInsert);
  }
}