import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Refund } from './refund.entity';

@Entity({ name: 'payments', schema: 'payment' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ length: 50 })
  method: string;

  @Column({ nullable: true })
  externalId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Refund, (r) => r.payment)
  refunds: Refund[];
}
