import { SopRequiredData } from "../../database/entities/sop.entity";

export interface SearchSopResponse {
    intentCode: string;
    agentOwner: string;
    title: string;
    requiredData: SopRequiredData[];
    workflowSteps: string[];
    permittedTools: string[];
}
