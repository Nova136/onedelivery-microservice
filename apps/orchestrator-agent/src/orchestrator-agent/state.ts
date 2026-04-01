import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * The graph state MUST include the following properties:
 * - messages: An array of recent conversation turns.
 * - summary: A rolling summary of the older conversation context.
 * - current_intent: The current routing intent (sticky session).
 * - order_states: A dictionary (key-value map) where the key is the orderId.
 */
export const OrchestratorState = Annotation.Root({
    ...MessagesAnnotation.spec,
    summary: Annotation<string>({
        reducer: (x, y) => (y === undefined ? x : y),
        default: () => "",
    }),
    current_intent: Annotation<string | null>({
        reducer: (x, y) => (y === undefined ? x : y),
        default: () => null,
    }),
    current_intent_index: Annotation<number>({
        reducer: (x, y) => (y === undefined ? x : y),
        default: () => 0,
    }),
    current_sop: Annotation<any | null>({
        reducer: (x, y) => (y === undefined ? x : y),
        default: () => null,
    }),
    last_evaluation: Annotation<{
        isSafe: boolean;
        isHallucination: boolean;
        isLeakage: boolean;
        issues?: string[];
    } | null>({
        reducer: (x, y) => y ?? x,
        default: () => null,
    }),
    retry_count: Annotation<number>({
        reducer: (x, y) => (y === 0 ? 0 : x + y),
        default: () => 0,
    }),
    order_states: Annotation<Record<string, any>>({
        reducer: (x, y) => {
            if (y === null) return {};
            return { ...x, ...y };
        },
        default: () => ({}),
    }),
    user_orders: Annotation<any[]>({
        reducer: (x, y) => y ?? x,
        default: () => [],
    }),
    partial_responses: Annotation<string[]>({
        reducer: (x, y) => {
            if (y === null) return [];
            if (!y) return x;
            return [...x, ...y];
        },
        default: () => [],
    }),
    decomposed_intents: Annotation<Array<{ intent: string; query: string }>>({
        reducer: (x, y) => y ?? x,
        default: () => [],
    }),
    multi_intent_acknowledged: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false,
    }),
    is_awaiting_confirmation: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false,
    }),
    is_input_valid: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => true,
    }),
    retrieved_context: Annotation<string[]>({
        reducer: (x, y) => {
            if (y === null) return [];
            if (!y) return x;
            return [...x, ...y];
        },
        default: () => [],
    }),
    has_truncated_intents: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false,
    }),
    remaining_intents: Annotation<Array<{ intent: string; query: string }>>({
        reducer: (x, y) => y ?? x,
        default: () => [],
    }),
    user_id: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    session_id: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    is_human_managed: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false,
    }),
});

export type OrchestratorStateType = typeof OrchestratorState.State;
