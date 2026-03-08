import { BaseEntity } from "@libs/utils/base.entity";
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ schema: "knowledge", name: "faq" })
export class Faq extends BaseEntity {
    @Column()
    title: string;

    @Column()
    content: string;

    @Column({ type: "vector", nullable: true })
    embedding: number[];
}
