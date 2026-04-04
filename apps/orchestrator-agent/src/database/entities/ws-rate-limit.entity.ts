import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity({ name: "rate_limit", schema: "ws" })
export class WsRateLimit {
    @PrimaryColumn({ type: "text" })
    userId: string;

    @PrimaryColumn({ type: "text" })
    windowKey: string;

    @Column({ type: "int", default: 0 })
    count: number;

    @Column({ type: "timestamptz" })
    expiresAt: Date;
}
