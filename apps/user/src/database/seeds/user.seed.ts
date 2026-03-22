import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import * as bcrypt from "bcrypt";
import { User } from "../entities/user.entity";
import { Role } from "../entities/role.enum";

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
                id: "79eb6c83-1851-466b-9d2f-b74aaa5d0f1c",
                email: "admin@onedelivery.demo",
                role: Role.Admin,
                plainPassword: "Admin123!",
                passwordHash: await bcrypt.hash("Admin123!", SALT_ROUNDS),
            },
            {
                id: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
                email: "user@onedelivery.demo",
                role: Role.User,
                plainPassword: "User123!",
                passwordHash: await bcrypt.hash("User123!", SALT_ROUNDS),
            },
        ];

        await repo.insert(users);
    }
}
