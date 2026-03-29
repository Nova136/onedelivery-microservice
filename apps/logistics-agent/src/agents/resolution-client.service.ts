import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

@Injectable()
export class ResolutionClientService {
    private readonly logger = new Logger(ResolutionClientService.name);
    constructor(
        @Inject("RESOLUTION_AGENT") private readonly resolutionClient: ClientProxy,
    ) {}

    async refundCancelOrder(orderId: string): Promise<any>{
        const result = await firstValueFrom(
            this.resolutionClient.send({cmd:"resolution.cancel"}, {orderId}),
        );
        return result;
    }
}
