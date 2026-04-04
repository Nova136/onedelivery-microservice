import { BaseEntity } from "@libs/utils/base.entity";
import { Column, Entity } from "typeorm";

export interface SopRequiredData {
    name: string;
    type: "string" | "number" | "boolean" | "array" | "object";
    description: string;
    enum?: string[];
    itemsSchema?: SopRequiredData[];
    properties?: SopRequiredData[];
}

@Entity({ schema: "knowledge", name: "sop" })
export class Sop extends BaseEntity {
    @Column({ name: "intent_code", unique: true })
    intentCode: string;

    @Column({ name: "agent_owner" })
    agentOwner: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    title: string;

    @Column("jsonb", { name: "required_data", default: [] })
    requiredData: SopRequiredData[];

    @Column("jsonb", { name: "workflow_steps", default: [] })
    workflowSteps: string[];

    @Column("jsonb", { name: "permitted_tools", default: [] })
    permittedTools: string[];
}
