import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ClientProxy } from "@nestjs/microservices";
import { CommonService } from "@libs/modules/common/common.service";
import {
  LogIncidentRequest,
  LogIncidentResponse,
} from "@libs/utils/rabbitmq-interfaces";

const logIncidentSchema = z.object({
    type: z
        .enum([
            "LATE_DELIVERY",
            "MISSING_ITEMS",
            "WRONG_ORDER",
            "DAMAGED_PACKAGING",
            "PAYMENT_FAILURE",
            "OTHER",
        ])
        .describe("Incident category"),
    summary: z.string().describe("Short summary of the issue"),
    orderId: z.string().optional().describe("Order ID if applicable"),
    userId: z.string().optional().describe("User ID if applicable"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLogIncidentTool(
    commonService: CommonService,
    incidentClient: ClientProxy,
): any {
    return tool(
        async (payload: {
            type: string;
            summary: string;
            orderId?: string;
            userId?: string;
        }) => {
            try {
                const result = await commonService.sendViaRMQ<LogIncidentResponse>(
                    incidentClient,
                    { cmd: "incident.log" },
                    payload as LogIncidentRequest,
                );

                return JSON.stringify({
                    summary: "Incident logged successfully.",
                    data: result,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return JSON.stringify({
                    summary: `Error logging incident: ${msg}`,
                    data: null,
                });
            }
        },
        {
            name: "log_incident",
            description:
                "Log a support incident when a customer problem occurred.",
            schema: logIncidentSchema,
        },
    );
}
