export interface SearchSopResponse {
    intentCode: string;
    agentOwner: string;
    title: string;
    requiredData: string[];
    workflowSteps: string[];
    permittedTools: string[];
}
