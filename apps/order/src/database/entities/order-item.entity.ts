import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
} from "typeorm";
import { Order } from "./order.entity";

@Entity({ name: "order_items", schema: "order" })
export class OrderItem {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 15 })
    orderId: string;

    @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
    @JoinColumn({ name: "order_id" })
    order: Order;

    @Column({ type: "uuid" })
    productId: string;

    @Column({ type: "varchar", length: 255 })
    productName: string;

    @Column("decimal", { precision: 10, scale: 2 })
    price: number;

    @Column({ type: "int" })
    quantityOrdered: number;

    @Column({ type: "int", default: 0 })
    quantityRefunded: number;

    @Column("decimal", { precision: 10, scale: 2 })
    itemValue: number;
}
