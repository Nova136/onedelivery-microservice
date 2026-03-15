import { Injectable, Inject, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

@Injectable()
export class OrderClientService {
    private readonly logger = new Logger(OrderClientService.name);

    constructor(
        @Inject("ORDER_SERVICE") private readonly client: ClientProxy,
    ) {}

    async getOrderDetails(orderId: string): Promise<any> {
        this.logger.log(`Fetching details for order ${orderId}`);
        const result = await firstValueFrom(
            this.client.send({ cmd: "order.get" }, { orderId }),
        );
        return result;
    }

    async executeCancellation(orderId: string): Promise<string> {
        this.logger.log(`Executing cancellation for order ${orderId}`);
        const result = await firstValueFrom(
            this.client.send({ cmd: "order.cancel" }, { orderId }),
        );
        return result.status;
    }
}
