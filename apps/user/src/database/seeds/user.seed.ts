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
        passwordHash: await bcrypt.hash('User123!', SALT_ROUNDS),

      },
      {
        email: 'user@onedelivery.demo',
        role: Role.User,
        plainPassword: 'User123!',
        passwordHash: await bcrypt.hash('User123!', SALT_ROUNDS),
      },
    ];


    await repo.insert(users);
  }
}