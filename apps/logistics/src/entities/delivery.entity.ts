import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { DeliveryTracking } from './delivery-tracking.entity';

@Entity({ name: 'deliveries', schema: 'logistics' })
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ nullable: true })
  riderId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  estimatedArrival: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => DeliveryTracking, (t) => t.delivery)
  tracking: DeliveryTracking[];
}
