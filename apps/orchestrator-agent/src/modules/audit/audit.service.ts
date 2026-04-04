import { Injectable, Logger } from "@nestjs/common";

export interface AuditEntry {
    session_id: string;
    node: string;
    action: string;
    input: any;
    output: any;
    metadata?: any;
    timestamp?: string;
}

@Injectable()
export class AuditService {
    private readonly logger = new Logger("AUDIT_TRAIL");

    /**
     * Persists an audit entry by logging it as a structured JSON string to stdout.
     * In AWS ECS, this is automatically captured and sent to CloudWatch Logs.
     */
    async log(entry: AuditEntry): Promise<void> {
        try {
            const auditEntry = {
                ...entry,
                timestamp: entry.timestamp || new Date().toISOString(),
                // Add a specific log type for easier filtering in CloudWatch
                log_type: "AUDIT_EVENT",
            };

            // nestjs-pino will automatically format this object as a structured JSON log
            this.logger.log(auditEntry);

            this.logger.debug(
                `Audit event captured for session ${entry.session_id}`,
            );
        } catch (error) {
            this.logger.error(`Failed to generate audit log: ${error}`);
        }
    }
}
