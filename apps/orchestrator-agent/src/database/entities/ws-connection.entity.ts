import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

@Entity({ name: "connections", schema: "ws" })
export class WsConnection {
    @PrimaryColumn({ type: "text" })
    connectionId: string;

    @Column({ type: "text" })
    userId: string;

    @Column({ type: "text" })
    sessionId: string;

    @CreateDateColumn({ type: "timestamptz" })
    connectedAt: Date;

    @Column({ type: "timestamptz" })
    expiresAt: Date;
}
