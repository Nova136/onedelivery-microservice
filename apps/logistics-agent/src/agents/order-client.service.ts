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

    async listOrders(customerId?: string): Promise<{
        orders: Array<{
            orderId: string;
            status: string;
            customerId: string;
            createdAt: string;
            items: unknown[];
        }>;
        message: string;
    }> {
        return firstValueFrom(
            this.client.send({ cmd: "order.list" }, customerId ? { customerId } : {}),
        );
    }

    async executeCancellation(orderId: string): Promise<string> {
        this.logger.log(`Executing cancellation for order ${orderId}`);
        const result = await firstValueFrom(
            this.client.send({ cmd: "order.cancel" }, { orderId }),
        );
        return result.status;
    }

    /** Advances order one step in the fulfillment chain via the order microservice. */
    async updateOrderStatus(orderId: string): Promise<string> {
        this.logger.log(`Advancing logistics step for order ${orderId}`);
        const result = await firstValueFrom(
            this.client.send({ cmd: "order.advanceLogistics" }, { orderId }),
        );
        if ("success" in result && result.success === false) {
            throw new Error(
                "message" in result && typeof result.message === "string"
                    ? result.message
                    : "Order status update failed",
            );
        }
        return String(result.status);
    }
}
