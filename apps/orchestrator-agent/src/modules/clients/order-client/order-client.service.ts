import { Injectable, Inject, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import { GetOrderResponse } from "./interface/get-order-response.interface";

@Injectable()
export class OrderClientService {
    private readonly logger = new Logger(OrderClientService.name);

    constructor(
        @Inject("ORDER_SERVICE") private readonly client: ClientProxy,
    ) {}

    async getRecentOrders(customerId: string): Promise<GetOrderResponse> {
        const result = await firstValueFrom(
            this.client.send({ cmd: "order.getRecent" }, { customerId }),
        );
        return result.orders;
    }
}
