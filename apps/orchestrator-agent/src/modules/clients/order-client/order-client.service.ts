import { Injectable, Inject, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

@Injectable()
export class OrderClientService {
    private readonly logger = new Logger(OrderClientService.name);

    constructor(
        @Inject("ORDER_SERVICE") private readonly client: ClientProxy,
    ) {}

    async getRecentOrders(customerId: string): Promise<any> {
        this.logger.log(`Fetching recent orders for customer ${customerId}`);
        const result = await firstValueFrom(
            this.client.send({ cmd: "order.getRecent" }, { customerId }),
        );
        return result.orders;
    }
}
