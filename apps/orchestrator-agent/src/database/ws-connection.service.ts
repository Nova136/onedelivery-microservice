import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { WsConnection } from "./entities/ws-connection.entity";

@Injectable()
export class WsConnectionService {
    private readonly logger = new Logger(WsConnectionService.name);

    constructor(
        @InjectRepository(WsConnection)
        private readonly repo: Repository<WsConnection>,
    ) {}

    async upsert(
        connectionId: string,
        userId: string,
        sessionId: string,
    ): Promise<void> {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await this.repo.upsert(
            { connectionId, userId, sessionId, expiresAt },
            { conflictPaths: ["connectionId"] },
        );
        this.logger.log(
            `[WS] Upserted connection connectionId=${connectionId} sessionId=${sessionId}`,
        );
    }

    async findConnectionId(sessionId: string): Promise<string[]> {
        this.logger.log(
            `[WS] Looking up connectionId for session=${sessionId}`,
        );
        const connections = await this.repo.find({
            where: { sessionId, expiresAt: MoreThan(new Date()) },
            select: ["connectionId"],
        });
        return connections.map((conn) => conn.connectionId);
    }
}
