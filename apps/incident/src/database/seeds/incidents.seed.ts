import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Incident } from "../entities/incidents.entity";

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
                type: "DELIVERY_DELAY",
                orderId: "FD-0000-000001",
                summary: "Shipment delayed by 24h due to weather.",
            },
            {
                type: "COMPLAINT",
                orderId: null,
                summary: "Customer feedback: packaging damaged.",
            },
        ];

        await repo.insert(incidents);
    }
}
