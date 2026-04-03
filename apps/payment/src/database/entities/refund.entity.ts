import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Relation,
} from "typeorm";
import { Payment } from "./payment.entity";

@Entity({ name: "refunds", schema: "payment" })
export class Refund {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255 })
    paymentId: string;

    @ManyToOne(() => Payment, (p) => p.refunds, { onDelete: "CASCADE" })
    @JoinColumn({ name: "paymentId" })
    payment: Relation<Payment>;

    @Column("decimal", { precision: 12, scale: 2 })
    amount: number;

    @Column({ type: "varchar", length: 255, nullable: true })
    reason: string | null;

    @Column({ type: "varchar", length: 15, default: "COMPLETED" })
    status: string;

    @CreateDateColumn()
    createdAt: Date;
}
