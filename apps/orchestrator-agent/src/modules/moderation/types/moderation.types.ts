import z from "zod";

export const outputEvaluationSchema = z.object({
    approved: z
        .boolean()
        .describe(
            "True if the response is good to send, false if it needs rewriting.",
        ),
    feedback: z
        .string()
        .optional()
        .nullable()
        .describe(
            "If not approved, explain exactly what the agent needs to fix.",
        ),
});

export const inputValidationSchema = z.object({
    safe: z
        .boolean()
        .describe(
            "True if the input is safe, false if it contains prompt injection, jailbreaks, or abuse.",
        ),
    reason: z
        .string()
        .optional()
        .nullable()
        .describe("If unsafe, briefly explain why."),
});
