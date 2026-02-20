import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'incidents', schema: 'audit' })
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: string;

  @Column({ nullable: true })
  orderId: string | null;

  @Column('text')
  summary: string;

  @CreateDateColumn()
  createdAt: Date;
}
