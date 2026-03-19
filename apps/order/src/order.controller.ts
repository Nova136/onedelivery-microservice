import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";
import { OrderService } from "./order.service";
import { ClientAuthGuard } from "@libs/utils/guards/auth.guard";
import { CurrentUser } from "@libs/utils/decorators/user.decorator";
import { GetOrderDto, CreateOrderDto, CreateOrderRequestDto } from "./core/dto";
import { ICreateOrderResponse, IListOrdersResponse } from "./core/interface";

function mapItem(item: {
    id: string;
    orderId: string;
    productId: string;
    productName: string;
    quantityOrdered: number;
    quantityRefunded: number;
    price: number;
}) {
    return {
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        productName: item.productName,
        quantityOrdered: item.quantityOrdered,
        quantityRefunded: item.quantityRefunded,
        price: Number(item.price),
    };
}

@ApiTags("Order")
@Controller("order")
export class OrderController {
    constructor(private readonly orderService: OrderService) {}

    @Post("send-order")
    @ApiBearerAuth()
    @ApiOperation({ summary: "Create a new order for the current user" })
    @ApiBody({ type: CreateOrderRequestDto })
    @ApiResponse({ status: 201, description: "Order created" })
    @ApiResponse({ status: 401, description: "Unauthorized" })
    @UseGuards(ClientAuthGuard)
    async createOrderHttp(
        @CurrentUser() customerId: string,
        @Body() body: CreateOrderRequestDto,
    ): Promise<ICreateOrderResponse> {
        const { order, paymentSuccess, transactionId } =
            await this.orderService.createWithPayment({
                customerId,
                items: body.items,
                deliveryAddress: body.deliveryAddress,
                priorityOption: body.priorityOption,
            });
        const response: ICreateOrderResponse = {
            orderId: order.id,
            status: order.status,
            customerId: order.customerId,
            deliveryAddress: order.deliveryAddress,
            priorityOption: order.priorityOption,
            createdAt: order.createdAt.toISOString(),
            items: order.items.map(mapItem),
            paymentSuccess,
            transactionId,
            message: paymentSuccess ? "Order created" : "Order created but payment failed",
        };
        return response;
    }

    @Get("orders")
    @ApiBearerAuth()
    @ApiOperation({ summary: "Get all orders for the current user" })
    @ApiResponse({ status: 200, description: "List of user orders" })
    @ApiResponse({ status: 401, description: "Unauthorized" })
    @UseGuards(ClientAuthGuard)
    async listMyOrders(
        @CurrentUser() customerId: string,
    ): Promise<IListOrdersResponse> {
        const orders = await this.orderService.listByCustomer(customerId);
        const response: IListOrdersResponse = {
            orders: orders.map((o) => ({
                orderId: o.id,
                status: o.status,
                customerId: o.customerId,
                deliveryAddress: o.deliveryAddress,
                priorityOption: o.priorityOption,
                transactionId: o.transactionId ?? null,
                createdAt: o.createdAt.toISOString(),
                items: o.items.map(mapItem),
                totalOrderValue: Number(o.totalOrderValue),
                totalRefundValue: Number(o.totalRefundValue),
                refundStatus: o.refundStatus,
            })),
        };
        return response;
    }

    @MessagePattern({ cmd: "order.get" })
    async getOrder(@Payload() data: GetOrderDto) {
        const order = await this.orderService.getById(data.orderId);
        if (!order) return { orderId: data.orderId, found: false };
        return {
            orderId: order.id,
            status: order.status,
            customerId: order.customerId,
            deliveryAddress: order.deliveryAddress,
            items: order.items,
            createdAt: order.createdAt.toISOString(),
        };
    }

    @MessagePattern({ cmd: "order.create" })
    async createOrder(@Payload() data: CreateOrderDto) {
        const order = await this.orderService.create(data);
        return {
            orderId: order!.id,
            status: order!.status,
            customerId: order!.customerId,
            message: "Order microservice: order created",
        };
    }

    @MessagePattern({ cmd: "order.list" })
    async listOrders(@Payload() data: { customerId?: string }) {
        const orders = await this.orderService.listByCustomer(
            data.customerId ?? "",
        );
        return {
            orders: orders.map((o) => ({
                orderId: o.id,
                status: o.status,
                customerId: o.customerId,
                createdAt: o.createdAt.toISOString(),
                items: o.items,
            })),
            message: "Order microservice: list returned",
        };
    }
}
