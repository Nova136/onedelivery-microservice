import { Injectable, Inject, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

export interface AuditLogPayload {
    action: string;
    entityType: string;
    entityId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditClientService {
    private readonly logger = new Logger(AuditClientService.name);

    constructor(
        @Inject("AUDIT_SERVICE") private readonly auditClient: ClientProxy,
    ) {}

    /**
     * Fire-and-forget audit log. Never blocks Guardian's response.
     */
    logEvent(payload: AuditLogPayload): void {
        firstValueFrom(
            this.auditClient.send({ cmd: "audit.log" }, payload),
        ).catch((err) => {
            this.logger.warn(`Audit log failed (non-critical): ${err?.message ?? err}`);
        });
    }
}
