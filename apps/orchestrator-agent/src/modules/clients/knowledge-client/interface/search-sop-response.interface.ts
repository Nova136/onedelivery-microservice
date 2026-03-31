export interface SopRequiredData {
    name: string;
    type: "string" | "number" | "boolean" | "array" | "object";
    description: string;
    enum?: string[];
    itemsSchema?: SopRequiredData[];
    properties?: SopRequiredData[];
}

export interface SearchSopResponse {
    intentCode: string;
    agentOwner: string;
    title: string;
    requiredData: SopRequiredData[];
    workflowSteps: string[];
    permittedTools: string[];
}
