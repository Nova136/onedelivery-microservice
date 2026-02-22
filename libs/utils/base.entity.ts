import { Column, CreateDateColumn, DeleteDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export abstract class BaseEntity {
    @PrimaryGeneratedColumn('identity', { name: 'id' })
    Id?: number;

    @Column({ name: 'status', type: 'boolean', default: true })
    Status?: boolean;

    @Column({ name: 'archived', type: 'boolean', default: false })
    Archived?: boolean;

    @CreateDateColumn({ name: 'created', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    Created?: Date;

    @Column({ name: 'created_by', type: 'varchar', length: 300, nullable: true })
    CreatedBy?: string;

    @UpdateDateColumn({ name: 'last_updated', type: 'timestamptz', nullable: true })
    LastUpdated?: Date;

    @Column({ name: 'last_updated_by', type: 'varchar', length: 300, nullable: true })
    LastUpdatedBy?: string;

    @DeleteDateColumn({ name: 'deleted_date', type: 'timestamptz', nullable: true })
    DeletedDate?: Date;

}