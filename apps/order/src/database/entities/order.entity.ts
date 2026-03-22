import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from "typeorm";
import { OrderItem } from "./order-item.entity";
import { OrderStatus, PriorityOption, RefundStatus } from "./order.enum";

@Entity({ name: "order", schema: "order" })
export class Order {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255 })
    customerId: string;

    @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.CREATED })
    status: OrderStatus;

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

    @Column({ type: "enum", enum: RefundStatus, default: RefundStatus.NONE })
    refundStatus: RefundStatus;

    @Column({
        type: "enum",
        enum: PriorityOption,
        default: PriorityOption.STANDARD,
    })
    priorityOption: PriorityOption;
}
