import { Injectable, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import { ClientProxy } from "@nestjs/microservices";
import { Order } from "./database/entities/order.entity";
import { OrderItem } from "./database/entities/order-item.entity";
import { CommonService } from "@libs/modules/common/common.service";
import {
    PaymentProcessResponse,
    AuditLogRequest,
    AuditLogResponse,
    LogIncidentRequest,
    LogIncidentResponse,
    PaymentOrderResponse,
    PaymentRefundResponse,
} from "@libs/utils/rabbitmq-interfaces";
import { CreateOrderDto, CreateOrderWithPaymentResultDto } from "./core/dto";
import {
    OrderStatus,
    PriorityOption,
    RefundStatus,
} from "./database/entities/order.enum";

/** Min time (ms) the order must stay in the current logistics step before the next advance. */
const LOGISTICS_STEP_MIN_MS: Record<PriorityOption, number> = {
    [PriorityOption.EXPRESS]: 1 * 60 * 1000,
    [PriorityOption.STANDARD]: 2 * 60 * 1000,
    [PriorityOption.ECONOMY]: 3 * 60 * 1000,
};

@Injectable()
export class OrderService {
    constructor(
        @InjectRepository(Order)
        private readonly orderRepo: Repository<Order>,
        @InjectRepository(OrderItem)
        private readonly orderItemRepo: Repository<OrderItem>,
        @Inject("PAYMENT_SERVICE")
        private readonly paymentClient: ClientProxy,
        @Inject("AUDIT_SERVICE")
        private readonly auditClient: ClientProxy,
        @Inject("INCIDENT_SERVICE")
        private readonly incidentClient: ClientProxy,
        private readonly commonService: CommonService,
    ) {}

    async getById(orderId: string) {
        return this.orderRepo.findOne({
            where: { id: orderId },
            relations: ["items"],
        });
    }

    async create(dto: CreateOrderDto) {
        const totalOrderValue = dto.items.reduce(
            (sum, it) => sum + it.price * it.quantity,
            0,
        );
        const order = this.orderRepo.create({
            customerId: dto.customerId,
            deliveryAddress: dto.deliveryAddress,
            priorityOption: dto.priorityOption
                ? dto.priorityOption
                : PriorityOption.STANDARD,
            status: OrderStatus.CREATED,
            totalOrderValue,
        });
        const saved = await this.orderRepo.save(order);

        const items = dto.items.map((it) =>
            this.orderItemRepo.create({
                orderId: saved.id,
                productId: it.productId,
                productName: it.productName,
                quantityOrdered: it.quantity,
                price: it.price,
                itemValue: it.price * it.quantity,
            }),
        );
        await this.orderItemRepo.save(items);

        return this.orderRepo.findOne({
            where: { id: saved.id },
            relations: ["items"],
        });
    }

    async createWithPayment(
        dto: CreateOrderDto,
        currency = "USD",
        method = "CARD",
    ): Promise<CreateOrderWithPaymentResultDto> {
        const order = await this.create(dto);
        if (!order) throw new Error("Order creation failed");

        const totalAmount = order.items.reduce(
            (sum, item) => sum + Number(item.price) * item.quantityOrdered,
            0,
        );

        let paymentResult: PaymentProcessResponse;
        try {
            paymentResult =
                await this.commonService.sendViaRMQ<PaymentProcessResponse>(
                    this.paymentClient,
                    { cmd: "payment.process" },
                    {
                        orderId: order.id,
                        amount: totalAmount,
                        currency,
                        method,
                    },
                );
        } catch {
            paymentResult = {
                success: false,
                transactionId: null,
                message: "Payment service unavailable",
            };
        }

        const paymentSuccess = paymentResult.success === true;
        const transactionId = paymentResult.transactionId ?? null;
        await this.orderRepo.update(order.id, {
            status: paymentSuccess
                ? OrderStatus.PAYMENT_COMPLETED
                : OrderStatus.PAYMENT_FAILED,
            transactionId,
        });

        const updated = await this.orderRepo.findOne({
            where: { id: order.id },
            relations: ["items"],
        });

        // Fire-and-forget audit log; failures should not break order flow
        const auditPayload: AuditLogRequest = {
            action: paymentSuccess
                ? "ORDER_PAYMENT_COMPLETED"
                : "ORDER_PAYMENT_FAILED",
            entityType: "Order",
            entityId: order.id,
            userId: order.customerId,
            metadata: {
                totalAmount,
                transactionId,
            },
        };
        this.commonService
            .sendViaRMQ<AuditLogResponse>(
                this.auditClient,
                { cmd: "audit.log" },
                auditPayload,
            )
            .catch((err) => {
                // eslint-disable-next-line no-console
                console.error(
                    "Failed to send audit log for order",
                    err?.message ?? err,
                );
            });

        // When payment fails, log incident for tracking
        if (!paymentSuccess) {
            const incidentPayload: LogIncidentRequest = {
                type: "PAYMENT_FAILED",
                summary:
                    paymentResult.message ??
                    "Order payment could not be completed",
                orderId: order.id,
            };
            console.log(
                "[OrderService] Sending incident log (payment failed)",
                { orderId: order.id },
            );
            this.commonService
                .sendViaRMQ<LogIncidentResponse>(
                    this.incidentClient,
                    { cmd: "incident.log" },
                    incidentPayload,
                )
                .then((res) => {
                    console.log(
                        "[OrderService] Incident log sent",
                        res?.incidentId ?? res,
                    );
                })
                .catch((err) => {
                    console.error(
                        "[OrderService] Failed to send incident log for order",
                        err?.message ?? err,
                    );
                });
        }

        return {
            order: updated!,
            paymentSuccess,
            transactionId,
        };
    }

    async updateItemRefunds(
        orderId: string,
        items: { orderItemId: string; quantity: number }[],
    ) {
        const order = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: ["items"],
        });
        if (!order) throw new Error(`Order ${orderId} not found`);

        for (const ri of items) {
            const item = order.items.find((oi) => oi.id === ri.orderItemId);
            if (!item) {
                throw new Error(
                    `Order item ${ri.orderItemId} not found in order ${orderId}`,
                );
            }

            const newRefunded = item.quantityRefunded + ri.quantity;
            if (newRefunded > item.quantityOrdered) {
                throw new Error(
                    `Refund quantity ${ri.quantity} would exceed ordered quantity ` +
                        `(${item.quantityRefunded} + ${ri.quantity} > ${item.quantityOrdered}) ` +
                        `for item ${ri.orderItemId}`,
                );
            }

            await this.orderItemRepo.update(ri.orderItemId, {
                quantityRefunded: newRefunded,
            });
        }

        const refreshed = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: ["items"],
        });

        const totalRefundValue = refreshed!.items.reduce(
            (sum, it) => sum + it.quantityRefunded * Number(it.price),
            0,
        );

        const fullyRefunded = refreshed!.items.every(
            (it) => it.quantityRefunded >= it.quantityOrdered,
        );
        const partiallyRefunded = refreshed!.items.some(
            (it) => it.quantityRefunded > 0,
        );

        let refundStatus = RefundStatus.NONE;
        if (fullyRefunded) refundStatus = RefundStatus.FULL;
        else if (partiallyRefunded) refundStatus = RefundStatus.PARTIAL;

        await this.orderRepo.update(orderId, {
            totalRefundValue,
            refundStatus,
        });

        return this.orderRepo.findOne({
            where: { id: orderId },
            relations: ["items"],
        });
    }

    async listByCustomer(customerId?: string) {
        return this.orderRepo.find({
            where: customerId ? { customerId } : undefined,
            relations: ["items"],
            order: { createdAt: "DESC" },
        });
    }

    async listRecent(customerId: string) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return this.orderRepo.find({
            where: {
                createdAt: MoreThan(twentyFourHoursAgo),
                customerId: customerId,
            },
            relations: ["items"],
            order: { createdAt: "DESC" },
        });
    }

    async cancel(orderId: string) {
        let paymentResult =
            await this.commonService.sendViaRMQ<PaymentOrderResponse>(
                this.paymentClient,
                { cmd: "payment.getByOrder" },
                { orderId: orderId },
            );

        let refundResult =
            await this.commonService.sendViaRMQ<PaymentRefundResponse>(
                this.paymentClient,
                { cmd: "payment.refund" },
                {
                    paymentId: paymentResult.paymentId,
                    amount: paymentResult.amount,
                    reason: "cancel order",
                },
            );

        const order = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: ["items"],
        });
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }
        order.status = OrderStatus.CANCELLED;
        order.updatedAt = new Date();
        order.totalRefundValue = refundResult.amount;
        order.refundStatus = RefundStatus.FULL;
        return this.orderRepo.save(order);
    }

    async updateStatus(orderId: string, status: OrderStatus) {
        const order = await this.orderRepo.findOne({
            where: { id: orderId },
        });
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }
        order.status = status;
        order.updatedAt = new Date();
        return await this.orderRepo.save(order);
    }

    /** Start of the current logistics step for elapsed-time checks (before first advance, uses order timestamps). */
    private logisticsWaitReference(order: Order): Date {
        if (order.lastLogisticsAdvanceAt) {
            return order.lastLogisticsAdvanceAt;
        }
        if (order.status === OrderStatus.PAYMENT_COMPLETED) {
            return order.updatedAt;
        }
        return order.createdAt;
    }

    /** Moves the order one step forward in the fulfillment chain (for logistics automation). */
    async advanceLogisticsStep(orderId: string): Promise<Order> {
        const order = await this.getById(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }
        const next: Partial<Record<OrderStatus, OrderStatus>> = {
            [OrderStatus.CREATED]: OrderStatus.PREPARATION,
            [OrderStatus.PAYMENT_COMPLETED]: OrderStatus.CREATED,
            [OrderStatus.PREPARATION]: OrderStatus.IN_DELIVERY,
            [OrderStatus.IN_DELIVERY]: OrderStatus.DELIVERED,
        };
        const n = next[order.status];
        if (!n) {
            return order;
        }
        const minMs = LOGISTICS_STEP_MIN_MS[order.priorityOption];
        const elapsed =
            Date.now() - this.logisticsWaitReference(order).getTime();
        if (elapsed < minMs) {
            return order;
        }
        order.status = n;
        order.updatedAt = new Date();
        order.lastLogisticsAdvanceAt = new Date();
        return this.orderRepo.save(order);
    }
}
