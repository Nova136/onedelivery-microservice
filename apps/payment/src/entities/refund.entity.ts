import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Payment } from './payment.entity';

@Entity({ name: 'refunds', schema: 'payment' })
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  paymentId: string;

  @ManyToOne(() => Payment, (p) => p.refunds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  reason: string | null;

  @Column({ default: 'COMPLETED' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
