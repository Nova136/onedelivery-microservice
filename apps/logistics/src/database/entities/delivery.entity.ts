import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    Relation,
} from "typeorm";
import { DeliveryTracking } from "./delivery-tracking.entity";

@Entity({ name: "deliveries", schema: "logistics" })
export class Delivery {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 15 })
    orderId: string;

    @Column({ default: "PENDING" })
    status: string;

    @Column({ type: "uuid", nullable: true })
    riderId: string | null;

    @Column({ type: "timestamptz", nullable: true })
    estimatedArrival: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => DeliveryTracking, (t) => t.delivery)
    tracking: Relation<DeliveryTracking[]>;
}
