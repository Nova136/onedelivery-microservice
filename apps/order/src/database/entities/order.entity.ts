import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from "typeorm";
import { OrderItem } from "./order-item.entity";

@Entity({ name: "order", schema: "order" })
export class Order {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255 })
    customerId: string;

    @Column({ type: "varchar", length: 32, default: "PENDING" })
    status: string;

    @Column({ type: "varchar", length: 512 })
    deliveryAddress: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    transactionId: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => OrderItem, (item) => item.order)
    items: OrderItem[];

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    totalOrderValue: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    totalRefundValue: number;

    @Column({ type: "varchar", length: 32, default: "NONE" })
    refundStatus: string;

    @Column({ type: "varchar", length: 32, default: "PRIO-STD" })
    priorityOption: string;
}
