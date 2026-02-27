import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'incidents', schema: 'incident' })
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column('text')
  summary: string;

  @CreateDateColumn()
  createdAt: Date;
}
