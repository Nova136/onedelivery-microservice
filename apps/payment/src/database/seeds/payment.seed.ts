import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Payment } from "../entities/payment.entity";
const { v4: uuidv4 } = require("uuid");

export default class PaymentSeeder implements Seeder {
    public async run(dataSource: DataSource): Promise<void> {
        const repo = dataSource.getRepository(Payment);

        // Clear existing payment data to ensure updates to this file are always applied
        const existing = await repo.count();
        if (existing > 0) {
            await repo.clear();
        }

        const payments: Partial<Payment>[] = [
            {
                orderId: "FD-0000-000001",
                amount: 12.0,
                currency: "USD",
                status: "COMPLETED",
                method: "CARD",
                externalId: "ext-seed-001",
            },
            {
                orderId: "FD-0000-000002",
                amount: 5.5,
                currency: "USD",
                status: "PENDING",
                method: "CARD",
                externalId: "ext-seed-002",
            },
            {
                orderId: "FD-0000-000003",
                amount: 6.5,
                currency: "USD",
                status: "COMPLETED",
                method: "CARD",
                externalId: "ext-seed-003",
            },
            {
                orderId: "FD-0000-000004",
                amount: 5.0,
                currency: "USD",
                status: "COMPLETED",
                method: "CARD",
                externalId: "ext-seed-004",
            },
            {
                orderId: "FD-0000-000005",
                amount: 4.5,
                currency: "USD",
                status: "COMPLETED",
                method: "CARD",
                externalId: "ext-seed-005",
            },
            {
                orderId: "FD-0000-000006",
                amount: 6.0,
                currency: "USD",
                status: "COMPLETED",
                method: "CARD",
                externalId: "ext-seed-006",
            },
            {
                orderId: "FD-0000-000007",
                amount: 5.5,
                currency: "USD",
                status: "COMPLETED",
                method: "CARD",
                externalId: "ext-seed-007",
            },
            {
                orderId: "FD-0000-000008",
                amount: 15.0,
                currency: "USD",
                status: "COMPLETED",
                method: "CARD",
                externalId: "ext-seed-008",
            },
            {
                orderId: "FD-0000-000009",
                amount: 55.0,
                currency: "USD",
                status: "COMPLETED",
                method: "CARD",
                externalId: "ext-seed-002",
            },
        ];

        await repo.insert(payments);
    }
}
