import { BaseEntity } from "@libs/utils/base.entity";
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ schema: "knowledge", name: "sop" })
export class Sop extends BaseEntity {
    @Column()
    title: string;

    @Column()
    content: string;

    @Column({ type: "vector", nullable: true })
    embedding: number[];
}
