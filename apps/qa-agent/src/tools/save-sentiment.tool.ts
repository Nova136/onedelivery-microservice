import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ClientProxy } from "@nestjs/microservices";
import { CommonService } from "@libs/modules/common/common.service";

const saveSentimentSchema = z.object({
	sessionId: z.string().describe("The chat session ID"),
	overallScore: z
		.number()
		.min(-1)
		.max(1)
		.describe("Sentiment score between -1.0 (very negative) and 1.0 (very positive)"),
	shouldEscalate: z
		.boolean()
		.describe("True if the customer is very upset (score <= -0.5)"),
	escalationReason: z
		.string()
		.nullable()
		.optional()
		.describe("Short reason if shouldEscalate is true, otherwise null"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSaveSentimentTool(
	commonService: CommonService,
	userClient: ClientProxy,
): any {
	return tool(
		async (payload: {
			sessionId: string;
			overallScore: number;
			shouldEscalate: boolean;
			escalationReason?: string | null;
		}) => {
			try {
				const result = await commonService.sendViaRMQ(
					userClient,
					{ cmd: "user.sentiment.save" },
					payload,
				);

				return JSON.stringify({
					summary: "Sentiment saved successfully.",
					data: result,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return JSON.stringify({
					summary: `Error saving sentiment: ${msg}`,
					data: null,
				});
			}
		},
		{
			name: "save_sentiment",
			description:
				"Save the overall sentiment score for the chat session. Always call this when reviewing a session.",
			schema: saveSentimentSchema,
		},
	);
}
