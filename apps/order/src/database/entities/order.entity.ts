import {
    Entity,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    BeforeInsert,
    PrimaryColumn,
} from "typeorm";
import { OrderItem } from "./order-item.entity";
import { OrderStatus, PriorityOption, RefundStatus } from "./order.enum";
import { customAlphabet } from "nanoid";

// Define a friendly alphabet (Removed 0, O, I, 1, L to prevent reading errors)
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const generateNanoId = customAlphabet(alphabet, 6);

@Entity({ name: "order", schema: "order" })
export class Order {
    @PrimaryColumn({ type: "varchar", length: 15, unique: true })
    id: string;

    @Column({ type: "uuid" })
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

    /** Set when a logistics auto-advance last ran; used with priority to enforce min time per step. */
    @Column({ type: "timestamp", nullable: true })
    lastLogisticsAdvanceAt: Date | null;

    @BeforeInsert()
    generateId() {
        const date = new Date();
        const prefix = `${date.getFullYear().toString().slice(-2)}${date.getMonth() + 1}`;
        this.id = `FD-${prefix}-${generateNanoId()}`;
    }
}
