import { BaseEntity } from "@libs/utils/base.entity";
import { Column, Entity } from "typeorm";

@Entity({ schema: "knowledge", name: "faq" })
export class Faq extends BaseEntity {
    @Column({ type: "varchar", length: 255, nullable: true })
    title: string;

    @Column({ type: "text", nullable: true })
    content: string;

    @Column({ type: "vector", nullable: true })
    embedding: number[];
}
