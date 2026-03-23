import {
    Entity,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    PrimaryColumn,
} from "typeorm";
import { Role } from "./role.enum";

@Entity({ name: "user", schema: "users" })
export class User {
    @PrimaryColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255, unique: true })
    email: string;

    @Column({ type: "varchar", length: 255 })
    passwordHash: string;

    @Column({ type: "varchar", length: 32, default: Role.User })
    role: Role;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
