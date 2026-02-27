import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Delivery } from './delivery.entity';

@Entity({ name: 'delivery_tracking', schema: 'logistics' })
export class DeliveryTracking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deliveryId: string;

  @ManyToOne(() => Delivery, (d) => d.tracking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliveryId' })
  delivery: Delivery;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  lat: number | null;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  lng: number | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  recordedAt: Date;
}
