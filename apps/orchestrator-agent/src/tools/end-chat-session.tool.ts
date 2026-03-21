import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
// Assuming AgentsClientService handles TCP routing to your microservices
import { AgentsClientService } from "../modules/agents-client/agents-client.service";
import { MemoryService } from "../modules/memory/memory.service";

interface EndChatSessionPayload {
    userId: string;
    sessionId: string;
}

const EndChatSessionSchema = z
    .object({
        userId: z.string().describe("The ID of the user."),
        sessionId: z.string().describe("The current session ID."),
    })
    .describe(
        "Input to end the chat session and submit it to the QA agent for data analysis and review.",
    );

export function createEndChatSessionTool(
    agentsClient: AgentsClientService,
    memoryService: MemoryService,
): StructuredTool {
    return tool(
        async (payload: EndChatSessionPayload) => {
            try {
                // First, we end the chat session and retrieve the full chat history
                await memoryService.endChatSession(
                    payload.userId,
                    payload.sessionId,
                );

                // Forward the payload to the QA Agent via TCP/Microservice call without waiting (fire-and-forget)
                agentsClient
                    .send("qa", {
                        userId: payload.userId,
                        sessionId: payload.sessionId,
                        message: "Route to QA Agent for session review",
                    })
                    .catch((err) => {
                        const msg =
                            err instanceof Error ? err.message : String(err);
                        console.error(`End Chat Session Async Error: ${msg}`);
                    });

                return "Successfully ended the chat session. You may now politely say goodbye to the user.";
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                // We don't necessarily want to alert the user if QA analytics fails,
                // so we return a silent success or logical fallback to the LLM.
                console.error(`End Chat Session Error: ${msg}`);
                return "Internal notification: QA logging failed, but you should still say goodbye to the user normally.";
            }
        },
        {
            name: "End_Chat_Session",
            description:
                "CRITICAL: Use this tool ONLY when the user indicates they are ending the session (e.g., saying goodbye, saying they have no more questions, or their issue is fully resolved). This sends the interaction to the QA Agent for data analysis.",
            schema: EndChatSessionSchema,
        },
    );
}
