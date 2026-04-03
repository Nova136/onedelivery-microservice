import { Annotation } from "@langchain/langgraph";

/**
 * State for the Agent Callback Graph
 */
export const AgentCallbackState = Annotation.Root({
    agent_message: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    redacted_message: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    is_safe: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => true,
    }),
    synthesized_message: Annotation<string | null>({
        reducer: (x, y) => y ?? x,
        default: () => null,
    }),
    user_id: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    session_id: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
});

export type AgentCallbackStateType = typeof AgentCallbackState.State;
