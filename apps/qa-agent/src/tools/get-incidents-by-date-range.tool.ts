import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ClientProxy } from "@nestjs/microservices";
import { CommonService } from "@libs/modules/common/common.service";

const getIncidentsByDateRangeSchema = z.object({
    startDate: z
        .string()
        .describe("ISO 8601 start date string (e.g. 2026-03-01T00:00:00.000Z)"),
    endDate: z
        .string()
        .describe("ISO 8601 end date string (e.g. 2026-03-31T23:59:59.999Z)"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGetIncidentsByDateRangeTool(
    commonService: CommonService,
    incidentClient: ClientProxy,
): any {
    return tool(
        async (payload: { startDate: string; endDate: string }) => {
            try {
                const result = await commonService.sendViaRMQ<any>(
                    incidentClient,
                    { cmd: "incident.getByDateRange" },
                    payload,
                );
                const incidents = Array.isArray(result)
                    ? result
                    : Array.isArray(result?.incidents)
                      ? result.incidents
                      : [];

                return JSON.stringify({
                    summary: `Fetched ${incidents.length} incidents.`,
                    data: incidents,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return JSON.stringify({
                    summary: `Error fetching incidents: ${msg}`,
                    data: [],
                });
            }
        },
        {
            name: "get_incidents_by_date_range",
            description:
                "Fetch all incidents within a given date range from the incident service. Returns a list of incidents with type, summary, orderId, userId, and timestamp.",
            schema: getIncidentsByDateRangeSchema,
        },
    );
}
