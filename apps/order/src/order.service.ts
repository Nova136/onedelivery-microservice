import { Injectable, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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
} from "@libs/utils/rabbitmq-interfaces";
import { CreateOrderDto, CreateOrderWithPaymentResultDto } from "./core/dto";

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
            priorityOption: dto.priorityOption ? dto.priorityOption :"PRIO-STD",
            status: "CREATED",
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
            status: paymentSuccess ? "PAYMENT_COMPLETED" : "PAYMENT_FAILED",
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
            (sum, it) =>
                sum + it.quantityRefunded * Number(it.price),
            0,
        );

        const fullyRefunded = refreshed!.items.every(
            (it) => it.quantityRefunded >= it.quantityOrdered,
        );
        const partiallyRefunded = refreshed!.items.some(
            (it) => it.quantityRefunded > 0,
        );

        let refundStatus = "NONE";
        if (fullyRefunded) refundStatus = "FULL";
        else if (partiallyRefunded) refundStatus = "PARTIAL";

        await this.orderRepo.update(orderId, {
            totalRefundValue,
            refundStatus,
        });

        return this.orderRepo.findOne({
            where: { id: orderId },
            relations: ["items"],
        });
    }

    async listByCustomer(customerId: string) {
        return this.orderRepo.find({
            where: { customerId },
            relations: ["items"],
            order: { createdAt: "DESC" },
        });
    }
}
