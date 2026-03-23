import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const GraphState = Annotation.Root({
    contextWindow: Annotation<BaseMessage[]>({
        reducer: (x, y) => y ?? x,
        default: () => [],
    }),
    scratchpad: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    activeToolNames: Annotation<string[]>({
        reducer: (x, y) => Array.from(new Set([...x, ...y])),
        default: () => [],
    }),
    circuitBreakerTriggered: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false,
    }),
    iterations: Annotation<number>({
        reducer: (x, y) => x + y,
        default: () => 0,
    }),
    finalAiMessage: Annotation<BaseMessage | undefined>({
        reducer: (x, y) => y ?? x,
        default: () => undefined,
    }),
    userId: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    sessionId: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    activeOrderId: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    intent: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    message: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
});
